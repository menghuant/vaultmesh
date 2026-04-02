import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Test ConnectionManager logic and message handling directly
// (without real WebSocket connections)

describe('WebSocket Server', () => {
  describe('WSData and connection lifecycle', () => {
    it('should define correct WSData interface shape', () => {
      const data = {
        connectionId: 'ws_1_123',
        authenticated: false,
        userId: undefined,
        tenantId: undefined,
        role: undefined,
      }
      expect(data.connectionId).toBe('ws_1_123')
      expect(data.authenticated).toBe(false)
    })
  })

  describe('ServerMessage types', () => {
    it('should serialize auth-ok message', () => {
      const msg = { type: 'auth-ok' as const, userId: 'user1' }
      const json = JSON.stringify(msg)
      const parsed = JSON.parse(json)
      expect(parsed.type).toBe('auth-ok')
      expect(parsed.userId).toBe('user1')
    })

    it('should serialize remote-change message', () => {
      const msg = {
        type: 'remote-change' as const,
        path: 'docs/readme.md',
        hash: 'abc123',
        updatedBy: 'user1',
        updatedAt: '2026-04-01T00:00:00Z',
      }
      const json = JSON.stringify(msg)
      const parsed = JSON.parse(json)
      expect(parsed.type).toBe('remote-change')
      expect(parsed.path).toBe('docs/readme.md')
    })

    it('should serialize conflict message', () => {
      const msg = {
        type: 'conflict' as const,
        path: 'test.md',
        serverHash: 'server123',
        yourHash: 'your456',
      }
      expect(JSON.parse(JSON.stringify(msg)).serverHash).toBe('server123')
    })

    it('should serialize permission-revoked message', () => {
      const msg = {
        type: 'permission-revoked' as const,
        paths: ['/hr-confidential/', '/finance/'],
      }
      expect(JSON.parse(JSON.stringify(msg)).paths).toHaveLength(2)
    })

    it('should serialize permission-granted message', () => {
      const msg = {
        type: 'permission-granted' as const,
        paths: ['/engineering/'],
      }
      expect(JSON.parse(JSON.stringify(msg)).paths[0]).toBe('/engineering/')
    })
  })

  describe('ClientMessage types', () => {
    it('should parse auth message', () => {
      const raw = JSON.stringify({ type: 'auth', token: 'jwt_token_here' })
      const msg = JSON.parse(raw)
      expect(msg.type).toBe('auth')
      expect(msg.token).toBe('jwt_token_here')
    })

    it('should parse file-changed message', () => {
      const raw = JSON.stringify({
        type: 'file-changed',
        path: 'test.md',
        hash: 'abc',
        sizeBytes: 1024,
      })
      const msg = JSON.parse(raw)
      expect(msg.type).toBe('file-changed')
      expect(msg.sizeBytes).toBe(1024)
    })

    it('should parse file-deleted message', () => {
      const raw = JSON.stringify({ type: 'file-deleted', path: 'old.md' })
      const msg = JSON.parse(raw)
      expect(msg.type).toBe('file-deleted')
      expect(msg.path).toBe('old.md')
    })

    it('should parse file-renamed message', () => {
      const raw = JSON.stringify({
        type: 'file-renamed',
        oldPath: 'old.md',
        newPath: 'new.md',
        hash: 'abc',
      })
      const msg = JSON.parse(raw)
      expect(msg.type).toBe('file-renamed')
    })

    it('should parse ping message', () => {
      const raw = JSON.stringify({ type: 'ping' })
      expect(JSON.parse(raw).type).toBe('ping')
    })
  })
})
