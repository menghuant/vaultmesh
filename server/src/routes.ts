import { Hono } from 'hono'
import { db } from './db.js'
import { authMiddleware, adminMiddleware } from './middleware.js'
import * as auth from './auth.js'
import * as sync from './sync.js'
import * as permissions from './permissions.js'
import { AppError, type ManifestRequest } from '@vaultmesh/shared'

const app = new Hono()

// ── Error Handler ────────────────────────────────────────

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: err.code, message: err.message }, err.statusCode as any)
  }
  console.error('Unhandled error:', err)
  return c.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, 500)
})

// ── Health Check ─────────────────────────────────────────

const startTime = Date.now()

app.get('/health', async (c) => {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected'
  try {
    // Quick DB connectivity check
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

app.post('/api/auth/signup', async (c) => {
  const body = await c.req.json()
  const result = await auth.signup(db, body)
  return c.json(result, 201)
})

app.post('/api/auth/login', async (c) => {
  const body = await c.req.json()
  const result = await auth.login(db, body)
  return c.json(result)
})

app.post('/api/auth/redeem', async (c) => {
  const body = await c.req.json()
  const result = await auth.redeem(db, body)
  return c.json(result, 201)
})

app.post('/api/auth/refresh', async (c) => {
  const body = await c.req.json()
  const result = await auth.refresh(db, body)
  return c.json(result)
})

// ── Protected Routes ─────────────────────────────────────

const api = new Hono()
api.use('*', authMiddleware)

// ── Sync Routes ──────────────────────────────────────────

api.post('/sync/manifest', async (c) => {
  const user = c.get('user')
  const body = await c.req.json() as ManifestRequest
  const plan = await sync.processManifest(db, user.tenant_id, user.sub, body.files)
  return c.json(plan)
})

// ── File Routes ──────────────────────────────────────────

api.put('/files/*', async (c) => {
  const user = c.get('user')
  const filePath = c.req.path.replace('/api/files/', '')
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
  const filePath = c.req.path.replace('/api/files/', '')

  const { content, hash, version } = await sync.downloadFile(db, user.tenant_id, user.sub, filePath)

  c.header('Content-Type', 'application/octet-stream')
  c.header('X-Content-Hash', hash)
  c.header('X-Version', String(version))
  c.header('Content-Length', String(content.length))
  return c.body(content as any)
})

api.delete('/files/*', async (c) => {
  const user = c.get('user')
  const filePath = c.req.path.replace('/api/files/', '')
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
  const result = await auth.invite(db, user.tenant_id, body)
  return c.json(result, 201)
})

admin.post('/permissions', async (c) => {
  const user = c.get('user')
  const { groupId, folderPath, role } = await c.req.json()
  await permissions.setFolderPermission(db, user.tenant_id, groupId, folderPath, role)
  return c.json({ ok: true })
})

admin.get('/conflicts', async (c) => {
  const user = c.get('user')
  const stats = await sync.getConflictStats(db, user.tenant_id)
  return c.json(stats)
})

admin.post('/groups', async (c) => {
  const user = c.get('user')
  const { name } = await c.req.json()
  const id = await permissions.createGroup(db, user.tenant_id, name)
  return c.json({ id }, 201)
})

admin.post('/groups/:groupId/members', async (c) => {
  const user = c.get('user')
  const groupId = c.req.param('groupId')
  const { email } = await c.req.json()
  await permissions.addUserToGroup(db, user.tenant_id, groupId, email)
  return c.json({ ok: true })
})

admin.delete('/groups/:groupId/members', async (c) => {
  const user = c.get('user')
  const groupId = c.req.param('groupId')
  const { email } = await c.req.json()
  await permissions.removeUserFromGroup(db, user.tenant_id, groupId, email)
  return c.json({ ok: true })
})

api.route('/admin', admin)
app.route('/api', api)

export { app }
