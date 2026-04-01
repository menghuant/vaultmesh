import { Hono } from 'hono'
import { db } from './db.js'
import { authMiddleware, adminMiddleware } from './middleware.js'
import * as auth from './auth.js'
import * as sync from './sync.js'
import * as permissions from './permissions.js'
import { AppError, ErrorCode, type ManifestRequest } from '@vaultmesh/shared'

const app = new Hono()

// ── Error Handler ────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.statusCode as any)
  }
  console.error('Unhandled error:', err)
  return c.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, 500)
})

// #2: Input validation helpers
function requireFields<T extends Record<string, unknown>>(body: T, fields: string[]): void {
  for (const field of fields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      throw new AppError(ErrorCode.AUTH_FAILED, `Missing required field: ${field}`, 400)
    }
  }
}

function requireString(body: Record<string, unknown>, field: string): string {
  const val = body[field]
  if (typeof val !== 'string' || val.trim() === '') {
    throw new AppError(ErrorCode.AUTH_FAILED, `${field} must be a non-empty string`, 400)
  }
  if (val.length > 1000) {
    throw new AppError(ErrorCode.AUTH_FAILED, `${field} too long (max 1000 chars)`, 400)
  }
  return val.trim()
}

// #19: Safe decodeURIComponent wrapper
function decodeFilePath(rawPath: string): string {
  try {
    return decodeURIComponent(rawPath)
  } catch {
    throw new AppError(ErrorCode.FILE_NOT_FOUND, 'Invalid file path encoding', 400)
  }
}

// ── Health Check ─────────────────────────────────────────

const startTime = Date.now()

app.get('/health', async (c) => {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected'
  try {
    await db.execute(/* sql */ `SELECT 1` as any)
    dbStatus = 'connected'
  } catch {
    dbStatus = 'disconnected'
  }

  return c.json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    db: dbStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  })
})

// ── Auth Routes (public) ─────────────────────────────────

// #9: Simple in-memory rate limiter for auth endpoints
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 20 // 20 requests per minute per IP

function checkRateLimit(ip: string): void {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return
  }
  entry.count++
  if (entry.count > RATE_LIMIT_MAX) {
    throw new AppError(ErrorCode.AUTH_FAILED, 'Too many requests. Try again later.', 429)
  }
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip)
  }
}, 300_000)

app.post('/api/auth/signup', async (c) => {
  checkRateLimit(c.req.header('x-forwarded-for') || 'unknown')
  const body = await c.req.json()
  const email = requireString(body, 'email')
  const password = requireString(body, 'password')
  const tenantName = requireString(body, 'tenantName')
  const result = await auth.signup(db, { email, password, tenantName })
  return c.json(result, 201)
})

app.post('/api/auth/login', async (c) => {
  checkRateLimit(c.req.header('x-forwarded-for') || 'unknown')
  const body = await c.req.json()
  const email = requireString(body, 'email')
  const password = requireString(body, 'password')
  const result = await auth.login(db, { email, password })
  return c.json(result)
})

app.post('/api/auth/redeem', async (c) => {
  checkRateLimit(c.req.header('x-forwarded-for') || 'unknown')
  const body = await c.req.json()
  const token = requireString(body, 'token')
  const password = requireString(body, 'password')
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : undefined
  const result = await auth.redeem(db, { token, password, displayName })
  return c.json(result, 201)
})

app.post('/api/auth/refresh', async (c) => {
  checkRateLimit(c.req.header('x-forwarded-for') || 'unknown')
  const body = await c.req.json()
  const refreshToken = requireString(body, 'refreshToken')
  const result = await auth.refresh(db, { refreshToken })
  return c.json(result)
})

// ── Protected Routes ─────────────────────────────────────

const api = new Hono()
api.use('*', authMiddleware)

// ── Sync Routes ──────────────────────────────────────────

api.post('/sync/manifest', async (c) => {
  const user = c.get('user')
  const body = await c.req.json() as ManifestRequest
  if (!Array.isArray(body.files)) {
    throw new AppError(ErrorCode.AUTH_FAILED, 'files must be an array', 400)
  }
  const plan = await sync.processManifest(db, user.tenant_id, user.sub, body.files)
  return c.json(plan)
})

// ── File Routes ──────────────────────────────────────────

api.put('/files/*', async (c) => {
  const user = c.get('user')
  const filePath = decodeFilePath(c.req.path.replace('/api/files/', ''))
  const baseHash = c.req.header('X-Base-Hash') || ''
  const body = await c.req.arrayBuffer()
  const content = Buffer.from(new Uint8Array(body))

  const result = await sync.uploadFile(db, user.tenant_id, user.sub, filePath, content, baseHash)
  if (!result.accepted) {
    return c.json(result, 409)
  }
  return c.json(result)
})

api.get('/files/*', async (c) => {
  const user = c.get('user')
  const filePath = decodeFilePath(c.req.path.replace('/api/files/', ''))

  const { content, hash, version } = await sync.downloadFile(db, user.tenant_id, user.sub, filePath)

  c.header('Content-Type', 'application/octet-stream')
  c.header('X-Content-Hash', hash)
  c.header('X-Version', String(version))
  c.header('Content-Length', String(content.length))
  return c.body(content as any)
})

api.delete('/files/*', async (c) => {
  const user = c.get('user')
  const filePath = decodeFilePath(c.req.path.replace('/api/files/', ''))
  await sync.softDeleteFile(db, user.tenant_id, user.sub, filePath)
  return c.json({ ok: true })
})

// ── Permission Routes ────────────────────────────────────

api.get('/permissions', async (c) => {
  const user = c.get('user')
  const folders = await permissions.getUserPermittedFolders(db, user.tenant_id, user.sub)
  return c.json(folders)
})

// ── Admin Routes ─────────────────────────────────────────

const admin = new Hono()
admin.use('*', adminMiddleware)

admin.post('/invite', async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const email = requireString(body, 'email')
  const role = requireString(body, 'role')
  const groupId = typeof body.groupId === 'string' ? body.groupId : undefined
  const result = await auth.invite(db, user.tenant_id, { email, role: role as 'admin' | 'member', groupId })
  return c.json(result, 201)
})

admin.post('/permissions', async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const groupId = requireString(body, 'groupId')
  const folderPath = requireString(body, 'folderPath')
  const role = requireString(body, 'role')
  const validRoles = ['viewer', 'editor', 'owner'] as const
  if (!validRoles.includes(role as any)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `Invalid role: ${role}. Must be viewer, editor, or owner`, 400)
  }
  await permissions.setFolderPermission(db, user.tenant_id, groupId, folderPath, role as 'viewer' | 'editor' | 'owner')
  return c.json({ ok: true })
})

admin.get('/conflicts', async (c) => {
  const user = c.get('user')
  const stats = await sync.getConflictStats(db, user.tenant_id)
  return c.json(stats)
})

admin.post('/groups', async (c) => {
  const user = c.get('user')
  const body = await c.req.json()
  const name = requireString(body, 'name')
  const id = await permissions.createGroup(db, user.tenant_id, name)
  return c.json({ id }, 201)
})

admin.post('/groups/:groupId/members', async (c) => {
  const user = c.get('user')
  const groupId = c.req.param('groupId')
  const body = await c.req.json()
  const email = requireString(body, 'email')
  await permissions.addUserToGroup(db, user.tenant_id, groupId, email)
  return c.json({ ok: true })
})

admin.delete('/groups/:groupId/members', async (c) => {
  const user = c.get('user')
  const groupId = c.req.param('groupId')
  const body = await c.req.json()
  const email = requireString(body, 'email')
  await permissions.removeUserFromGroup(db, user.tenant_id, groupId, email)
  return c.json({ ok: true })
})

api.route('/admin', admin)
app.route('/api', api)

export { app }
