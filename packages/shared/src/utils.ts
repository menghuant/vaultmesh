import { createHash, randomBytes } from 'node:crypto'

/** SHA-256 hash of a buffer, returns hex string */
export function sha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex')
}

/** Generate a nanoid-style random ID */
export function generateId(length = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
  const bytes = randomBytes(length)
  let id = ''
  for (let i = 0; i < length; i++) {
    id += alphabet[bytes[i]! % alphabet.length]
  }
  return id
}

/** Normalize file path: forward slashes, no leading slash, no trailing slash, no double slashes */
export function normalizePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\//, '')
    .replace(/\/$/, '')
}

/** Normalize folder path: forward slashes, leading slash, trailing slash */
export function normalizeFolderPath(folderPath: string): string {
  let p = folderPath.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!p.startsWith('/')) p = '/' + p
  if (!p.endsWith('/')) p = p + '/'
  return p
}

/** Check if two paths collide case-insensitively */
export function pathsCollide(a: string, b: string): boolean {
  return normalizePath(a).toLowerCase() === normalizePath(b).toLowerCase() &&
    normalizePath(a) !== normalizePath(b)
}

/** Check if a file path is under a folder path */
export function isUnderFolder(filePath: string, folderPath: string): boolean {
  const normalizedFile = '/' + normalizePath(filePath)
  const normalizedFolder = normalizeFolderPath(folderPath)
  // Root folder "/" contains everything
  if (normalizedFolder === '/') return true
  return normalizedFile.startsWith(normalizedFolder) ||
    normalizedFile + '/' === normalizedFolder
}

// ── Invite Token Encoding ────────────────────────────────
// Format: vmsh_inv_{base64(JSON({serverUrl, secret, expiresAt}))}

export interface InviteTokenData {
  serverUrl: string
  secret: string
  expiresAt: string
}

export function encodeInviteToken(data: InviteTokenData): string {
  const json = JSON.stringify(data)
  const encoded = Buffer.from(json).toString('base64url')
  return `vmsh_inv_${encoded}`
}

export function decodeInviteToken(token: string): InviteTokenData | null {
  if (!token.startsWith('vmsh_inv_')) return null
  try {
    const encoded = token.slice('vmsh_inv_'.length)
    const json = Buffer.from(encoded, 'base64url').toString('utf-8')
    return JSON.parse(json) as InviteTokenData
  } catch {
    return null
  }
}

/** Generate a crypto-random secret for invite tokens */
export function generateSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

// ── Structured Logging ───────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

let currentLogLevel: LogLevel = 'info'

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level
}

export function log(level: LogLevel, mod: string, event: string, details?: Record<string, unknown>): void {
  if (LOG_LEVELS[level] < LOG_LEVELS[currentLogLevel]) return
  const entry = {
    ts: new Date().toISOString(),
    level,
    mod,
    event,
    ...details,
  }
  const line = JSON.stringify(entry)
  if (level === 'error') {
    process.stderr.write(line + '\n')
  } else {
    process.stdout.write(line + '\n')
  }
}

// ── Constants ────────────────────────────────────────────

export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const MAX_FILE_VERSIONS = 30
export const JWT_ACCESS_TOKEN_EXPIRY = '15m'
export const JWT_REFRESH_TOKEN_EXPIRY_DAYS = 30
export const INVITE_TOKEN_EXPIRY_HOURS = 72
export const CONFLICT_THRESHOLD_PER_WEEK = 5
export const SOFT_DELETE_RETENTION_DAYS = 30
