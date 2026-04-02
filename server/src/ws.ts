import type { ServerWebSocket } from 'bun'
import { verifyAccessToken } from './auth.js'
import { log, type ClientMessage, type ServerMessage, type JWTPayload } from '@vaultmesh/shared'

// ── Connection State ────────────────────────────────────

interface WSConnection {
  ws: ServerWebSocket<WSData>
  userId: string
  tenantId: string
  role: string
  lastPong: number
}

export interface WSData {
  connectionId: string
  authenticated: boolean
  userId?: string
  tenantId?: string
  role?: string
}

// ── ConnectionManager ───────────────────────────────────

const MAX_CONNECTIONS_PER_TENANT = 100
const MAX_TOTAL_CONNECTIONS = 1000

class ConnectionManager {
  // tenantId -> Set<connectionId>
  private tenants = new Map<string, Set<string>>()
  // connectionId -> WSConnection
  private connections = new Map<string, WSConnection>()
  private nextId = 0
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Heartbeat: ping every 30s, drop connections that haven't ponged in 60s
    this.heartbeatInterval = setInterval(() => this.heartbeat(), 30_000)
  }

  generateId(): string {
    return `ws_${++this.nextId}_${Date.now()}`
  }

  /** Returns false if connection limits are exceeded */
  add(ws: ServerWebSocket<WSData>, payload: JWTPayload): boolean {
    // Enforce connection limits
    if (this.connections.size >= MAX_TOTAL_CONNECTIONS) {
      log('warn', 'ws', 'max-total-connections-reached', { current: this.connections.size })
      return false
    }
    const tenantCount = this.getTenantConnectionCount(payload.tenant_id)
    if (tenantCount >= MAX_CONNECTIONS_PER_TENANT) {
      log('warn', 'ws', 'max-tenant-connections-reached', { tenantId: payload.tenant_id, current: tenantCount })
      return false
    }

    const connId = ws.data.connectionId
    const conn: WSConnection = {
      ws,
      userId: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
      lastPong: Date.now(),
    }

    this.connections.set(connId, conn)

    if (!this.tenants.has(payload.tenant_id)) {
      this.tenants.set(payload.tenant_id, new Set())
    }
    this.tenants.get(payload.tenant_id)!.add(connId)

    ws.data.authenticated = true
    ws.data.userId = payload.sub
    ws.data.tenantId = payload.tenant_id
    ws.data.role = payload.role

    log('info', 'ws', 'connection-authenticated', {
      connectionId: connId,
      userId: payload.sub,
      tenantId: payload.tenant_id,
    })
    return true
  }

  remove(connId: string): void {
    const conn = this.connections.get(connId)
    if (!conn) return

    this.connections.delete(connId)
    const tenantSet = this.tenants.get(conn.tenantId)
    if (tenantSet) {
      tenantSet.delete(connId)
      if (tenantSet.size === 0) {
        this.tenants.delete(conn.tenantId)
      }
    }

    log('debug', 'ws', 'connection-removed', {
      connectionId: connId,
      userId: conn.userId,
      tenantId: conn.tenantId,
    })
  }

  /** Broadcast a message to all connections in a tenant, optionally excluding one */
  broadcast(tenantId: string, message: ServerMessage, excludeConnId?: string): void {
    const tenantSet = this.tenants.get(tenantId)
    if (!tenantSet) return

    const data = JSON.stringify(message)
    for (const connId of tenantSet) {
      if (connId === excludeConnId) continue
      const conn = this.connections.get(connId)
      if (conn) {
        try {
          conn.ws.send(data)
        } catch {
          // Connection broken, will be cleaned up on close
        }
      }
    }
  }

  /** Send a message to a specific connection */
  send(connId: string, message: ServerMessage): void {
    const conn = this.connections.get(connId)
    if (!conn) return
    try {
      conn.ws.send(JSON.stringify(message))
    } catch {
      // Connection broken
    }
  }

  recordPong(connId: string): void {
    const conn = this.connections.get(connId)
    if (conn) conn.lastPong = Date.now()
  }

  private heartbeat(): void {
    const now = Date.now()
    const staleThreshold = 60_000 // 60s without pong = dead

    for (const [connId, conn] of this.connections) {
      if (now - conn.lastPong > staleThreshold) {
        log('info', 'ws', 'dead-connection-cleanup', {
          connectionId: connId,
          userId: conn.userId,
          tenantId: conn.tenantId,
          lastPong: conn.lastPong,
        })
        try { conn.ws.close(1000, 'heartbeat timeout') } catch {}
        this.remove(connId)
      } else {
        try { conn.ws.ping() } catch {}
      }
    }
  }

  getConnectionCount(): number {
    return this.connections.size
  }

  getTenantConnectionCount(tenantId: string): number {
    return this.tenants.get(tenantId)?.size ?? 0
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    for (const [, conn] of this.connections) {
      try { conn.ws.close(1001, 'server shutdown') } catch {}
    }
    this.connections.clear()
    this.tenants.clear()
    // Clean up all pending auth timers
    clearAllAuthTimeouts()
  }
}

// ── Singleton ───────────────────────────────────────────

export const connectionManager = new ConnectionManager()

// ── Auth Timeout ────────────────────────────────────────

const AUTH_TIMEOUT_MS = 10_000 // 10s to authenticate after connecting

const pendingAuth = new Map<string, ReturnType<typeof setTimeout>>()

function clearAllAuthTimeouts(): void {
  for (const timer of pendingAuth.values()) {
    clearTimeout(timer)
  }
  pendingAuth.clear()
}

export function startAuthTimeout(connId: string, ws: ServerWebSocket<WSData>): void {
  const timer = setTimeout(() => {
    if (!ws.data.authenticated) {
      log('warn', 'ws', 'auth-timeout', { connectionId: connId })
      try {
        ws.send(JSON.stringify({ type: 'auth-failed', reason: 'Authentication timeout' }))
        ws.close(4001, 'auth timeout')
      } catch {}
    }
    pendingAuth.delete(connId)
  }, AUTH_TIMEOUT_MS)
  pendingAuth.set(connId, timer)
}

export function clearAuthTimeout(connId: string): void {
  const timer = pendingAuth.get(connId)
  if (timer) {
    clearTimeout(timer)
    pendingAuth.delete(connId)
  }
}

// ── Message Handler ─────────────────────────────────────

export async function handleMessage(ws: ServerWebSocket<WSData>, raw: string | Buffer): Promise<void> {
  const connId = ws.data.connectionId
  let msg: ClientMessage

  try {
    msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as ClientMessage
  } catch {
    log('warn', 'ws', 'invalid-json', { connectionId: connId })
    return
  }

  // First message must be auth
  if (!ws.data.authenticated) {
    if (msg.type !== 'auth') {
      ws.send(JSON.stringify({ type: 'auth-failed', reason: 'First message must be auth' }))
      ws.close(4001, 'not authenticated')
      return
    }

    try {
      const payload = await verifyAccessToken(msg.token)
      const added = connectionManager.add(ws, payload)
      if (!added) {
        ws.send(JSON.stringify({ type: 'auth-failed', reason: 'Connection limit exceeded' }))
        ws.close(4003, 'connection limit')
        return
      }
      clearAuthTimeout(connId)
      ws.send(JSON.stringify({ type: 'auth-ok', userId: payload.sub }))
    } catch {
      ws.send(JSON.stringify({ type: 'auth-failed', reason: 'Invalid or expired token' }))
      ws.close(4001, 'auth failed')
    }
    return
  }

  // Authenticated messages
  switch (msg.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }))
      // Pong tracking handled by protocol-level pong in handlePong, not here
      break

    case 'file-changed':
      connectionManager.broadcast(ws.data.tenantId!, {
        type: 'remote-change',
        path: msg.path,
        hash: msg.hash,
        updatedBy: ws.data.userId!,
        updatedAt: new Date().toISOString(),
      }, connId)
      break

    case 'file-deleted':
      connectionManager.broadcast(ws.data.tenantId!, {
        type: 'remote-delete',
        path: msg.path,
        deletedBy: ws.data.userId!,
      }, connId)
      break

    case 'file-renamed':
      connectionManager.broadcast(ws.data.tenantId!, {
        type: 'remote-rename',
        oldPath: msg.oldPath,
        newPath: msg.newPath,
      }, connId)
      break

    default:
      log('warn', 'ws', 'unknown-message-type', { connectionId: connId, type: (msg as any).type })
  }
}

export function handleClose(ws: ServerWebSocket<WSData>): void {
  const connId = ws.data.connectionId
  clearAuthTimeout(connId)
  connectionManager.remove(connId)
}

export function handlePong(ws: ServerWebSocket<WSData>): void {
  connectionManager.recordPong(ws.data.connectionId)
}
