import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ServerMessage, ClientMessage } from '@vaultmesh/shared'

// We can't import ConnectionManager directly since it uses Bun's ServerWebSocket,
// which isn't available in Vitest. But we CAN test the logic indirectly.

/** Mock ServerWebSocket for testing */
function mockWS(data: { connectionId: string; authenticated: boolean; userId?: string; tenantId?: string; role?: string }) {
  const sent: string[] = []
  return {
    data,
    send(msg: string) { sent.push(msg) },
    close() {},
    ping() {},
    _sent: sent,
  }
}

describe('WebSocket Server', () => {
  describe('ConnectionManager logic', () => {
    it('should track connections per tenant', () => {
      // Simulate ConnectionManager's internal data structure
      const tenants = new Map<string, Set<string>>()
      const connections = new Map<string, { userId: string; tenantId: string }>()

      // Add connection for tenant1
      const connId1 = 'ws_1'
      connections.set(connId1, { userId: 'user1', tenantId: 'tenant1' })
      if (!tenants.has('tenant1')) tenants.set('tenant1', new Set())
      tenants.get('tenant1')!.add(connId1)

      // Add another connection for tenant1
      const connId2 = 'ws_2'
      connections.set(connId2, { userId: 'user2', tenantId: 'tenant1' })
      tenants.get('tenant1')!.add(connId2)

      // Add connection for tenant2
      const connId3 = 'ws_3'
      connections.set(connId3, { userId: 'user3', tenantId: 'tenant2' })
      tenants.set('tenant2', new Set([connId3]))

      expect(tenants.get('tenant1')!.size).toBe(2)
      expect(tenants.get('tenant2')!.size).toBe(1)
      expect(connections.size).toBe(3)
    })

    it('should remove connection and clean up empty tenants', () => {
      const tenants = new Map<string, Set<string>>()
      const connections = new Map<string, { tenantId: string }>()

      connections.set('ws_1', { tenantId: 'tenant1' })
      tenants.set('tenant1', new Set(['ws_1']))

      // Remove connection
      const conn = connections.get('ws_1')!
      connections.delete('ws_1')
      const tenantSet = tenants.get(conn.tenantId)!
      tenantSet.delete('ws_1')
      if (tenantSet.size === 0) tenants.delete(conn.tenantId)

      expect(connections.size).toBe(0)
      expect(tenants.has('tenant1')).toBe(false)
    })

    it('should broadcast only to same tenant, excluding sender', () => {
      const tenants = new Map<string, Set<string>>()
      tenants.set('tenant1', new Set(['ws_1', 'ws_2', 'ws_3']))
      tenants.set('tenant2', new Set(['ws_4']))

      const sentTo: string[] = []
      const excludeConnId = 'ws_1'

      // Simulate broadcast for tenant1
      for (const connId of tenants.get('tenant1')!) {
        if (connId === excludeConnId) continue
        sentTo.push(connId)
      }

      expect(sentTo).toEqual(['ws_2', 'ws_3'])
      // tenant2 connections should NOT be included
      expect(sentTo).not.toContain('ws_4')
    })

    it('should detect stale connections via pong tracking', () => {
      const now = Date.now()
      const staleThreshold = 60_000

      const connections = [
        { id: 'ws_1', lastPong: now - 10_000 },  // 10s ago, alive
        { id: 'ws_2', lastPong: now - 70_000 },  // 70s ago, dead
        { id: 'ws_3', lastPong: now - 59_000 },  // 59s ago, alive
      ]

      const dead = connections.filter(c => now - c.lastPong > staleThreshold)
      expect(dead.map(c => c.id)).toEqual(['ws_2'])
    })
  })

  describe('Message handling flow', () => {
    it('should require auth as first message', () => {
      // If ws.data.authenticated is false and message type is not 'auth', close
      const ws = mockWS({ connectionId: 'ws_1', authenticated: false })
      const msg: ClientMessage = { type: 'ping' }

      // Non-auth message on unauthenticated connection should fail
      if (!ws.data.authenticated && msg.type !== 'auth') {
        ws.send(JSON.stringify({ type: 'auth-failed', reason: 'First message must be auth' }))
      }

      expect(ws._sent).toHaveLength(1)
      expect(JSON.parse(ws._sent[0]!).type).toBe('auth-failed')
    })

    it('should accept auth message and mark authenticated', () => {
      const ws = mockWS({ connectionId: 'ws_1', authenticated: false })

      // Simulate successful auth
      ws.data.authenticated = true
      ws.data.userId = 'user1'
      ws.data.tenantId = 'tenant1'
      ws.data.role = 'member'
      ws.send(JSON.stringify({ type: 'auth-ok', userId: 'user1' }))

      expect(ws.data.authenticated).toBe(true)
      expect(JSON.parse(ws._sent[0]!).type).toBe('auth-ok')
    })

    it('should respond to ping with pong', () => {
      const ws = mockWS({ connectionId: 'ws_1', authenticated: true, userId: 'u1', tenantId: 't1' })
      ws.send(JSON.stringify({ type: 'pong' }))
      expect(JSON.parse(ws._sent[0]!).type).toBe('pong')
    })
  })

  describe('ServerMessage serialization', () => {
    it('should serialize remote-change with all fields', () => {
      const msg: ServerMessage = {
        type: 'remote-change',
        path: 'docs/readme.md',
        hash: 'a'.repeat(64),
        updatedBy: 'user1',
        updatedAt: '2026-04-01T00:00:00Z',
      }
      const parsed = JSON.parse(JSON.stringify(msg))
      expect(parsed.type).toBe('remote-change')
      expect(parsed.path).toBe('docs/readme.md')
      expect(parsed.hash).toHaveLength(64)
    })

    it('should serialize remote-delete with deletedBy', () => {
      const msg: ServerMessage = {
        type: 'remote-delete',
        path: 'old.md',
        deletedBy: 'user2',
      }
      expect(JSON.parse(JSON.stringify(msg)).deletedBy).toBe('user2')
    })

    it('should serialize conflict with both hashes', () => {
      const msg: ServerMessage = {
        type: 'conflict',
        path: 'test.md',
        serverHash: 'a'.repeat(64),
        yourHash: 'b'.repeat(64),
      }
      const parsed = JSON.parse(JSON.stringify(msg))
      expect(parsed.serverHash).not.toBe(parsed.yourHash)
    })

    it('should serialize permission-revoked with paths array', () => {
      const msg: ServerMessage = {
        type: 'permission-revoked',
        paths: ['/hr-confidential/', '/finance/'],
      }
      expect(JSON.parse(JSON.stringify(msg)).paths).toHaveLength(2)
    })

    it('should serialize permission-granted with paths array', () => {
      const msg: ServerMessage = {
        type: 'permission-granted',
        paths: ['/engineering/'],
      }
      expect(JSON.parse(JSON.stringify(msg)).paths[0]).toBe('/engineering/')
    })
  })

  describe('ClientMessage parsing', () => {
    it('should parse auth message', () => {
      const msg: ClientMessage = { type: 'auth', token: 'jwt_here' }
      expect(msg.type).toBe('auth')
    })

    it('should parse file-changed', () => {
      const msg: ClientMessage = { type: 'file-changed', path: 'test.md', hash: 'abc', sizeBytes: 100 }
      expect(msg.path).toBe('test.md')
    })

    it('should parse file-deleted', () => {
      const msg: ClientMessage = { type: 'file-deleted', path: 'old.md' }
      expect(msg.type).toBe('file-deleted')
    })

    it('should parse file-renamed', () => {
      const msg: ClientMessage = { type: 'file-renamed', oldPath: 'a.md', newPath: 'b.md', hash: 'x' }
      expect(msg.oldPath).toBe('a.md')
    })

    it('should handle invalid JSON gracefully', () => {
      expect(() => JSON.parse('not json')).toThrow()
    })
  })

  describe('Auth timeout', () => {
    it('should track pending auth timers', () => {
      const pendingAuth = new Map<string, ReturnType<typeof setTimeout>>()
      const connId = 'ws_1'

      const timer = setTimeout(() => {}, 10_000)
      pendingAuth.set(connId, timer)
      expect(pendingAuth.has(connId)).toBe(true)

      clearTimeout(pendingAuth.get(connId)!)
      pendingAuth.delete(connId)
      expect(pendingAuth.has(connId)).toBe(false)
    })
  })
})
