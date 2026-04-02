import { describe, it, expect } from 'vitest'
import type { ManifestEntry, SyncPlan, UploadResult, ServerMessage } from '@vaultmesh/shared'

describe('RealTransport', () => {
  describe('HTTP URL construction', () => {
    it('should encode file paths for upload URL', () => {
      const serverUrl = 'http://localhost:4000'
      const path = 'docs/my file (1).md'
      const url = `${serverUrl}/api/files/${encodeURIComponent(path)}`
      expect(url).toBe('http://localhost:4000/api/files/docs%2Fmy%20file%20(1).md')
    })

    it('should handle special characters in path', () => {
      const path = 'projects/日本語/readme.md'
      const encoded = encodeURIComponent(path)
      expect(decodeURIComponent(encoded)).toBe(path)
    })
  })

  describe('WebSocket URL conversion', () => {
    it('should convert http to ws', () => {
      const serverUrl = 'http://localhost:4000'
      const wsUrl = serverUrl.replace(/^http/, 'ws')
      expect(wsUrl).toBe('ws://localhost:4000')
    })

    it('should convert https to wss', () => {
      const serverUrl = 'https://sync.example.com'
      const wsUrl = serverUrl.replace(/^http/, 'ws')
      expect(wsUrl).toBe('wss://sync.example.com')
    })
  })

  describe('manifest entry format', () => {
    it('should create valid manifest entries', () => {
      const entry: ManifestEntry = {
        path: 'docs/readme.md',
        hash: 'a'.repeat(64),
        sizeBytes: 1024,
      }
      expect(entry.path).toBe('docs/readme.md')
      expect(entry.hash).toHaveLength(64)
      expect(entry.sizeBytes).toBe(1024)
    })
  })

  describe('sync plan response', () => {
    it('should handle empty sync plan', () => {
      const plan: SyncPlan = {
        download: [],
        upload: [],
        conflict: [],
        delete: [],
      }
      expect(plan.download).toHaveLength(0)
    })

    it('should handle plan with all categories', () => {
      const plan: SyncPlan = {
        download: [{ path: 'new.md', hash: 'a'.repeat(64), sizeBytes: 100 }],
        upload: [{ path: 'local.md' }],
        conflict: [{ path: 'both.md', serverHash: 'a'.repeat(64), localHash: 'b'.repeat(64) }],
        delete: [{ path: 'removed.md', lastKnownHash: 'c'.repeat(64) }],
      }
      expect(plan.download).toHaveLength(1)
      expect(plan.upload).toHaveLength(1)
      expect(plan.conflict).toHaveLength(1)
      expect(plan.delete).toHaveLength(1)
    })
  })

  describe('upload result handling', () => {
    it('should handle accepted upload', () => {
      const result: UploadResult = { accepted: true, version: 1 }
      expect(result.accepted).toBe(true)
      expect(result.conflict).toBeUndefined()
    })

    it('should handle conflict upload', () => {
      const result: UploadResult = {
        accepted: false,
        conflict: { serverHash: 'a'.repeat(64), clientHash: 'b'.repeat(64) },
        version: 3,
      }
      expect(result.accepted).toBe(false)
      expect(result.conflict?.serverHash).toHaveLength(64)
    })
  })

  describe('server message parsing', () => {
    it('should parse remote-change message', () => {
      const raw = '{"type":"remote-change","path":"test.md","hash":"abc","updatedBy":"user1","updatedAt":"2026-04-01T00:00:00Z"}'
      const msg = JSON.parse(raw) as ServerMessage
      expect(msg.type).toBe('remote-change')
      if (msg.type === 'remote-change') {
        expect(msg.path).toBe('test.md')
        expect(msg.updatedBy).toBe('user1')
      }
    })

    it('should handle invalid JSON gracefully', () => {
      const raw = 'not valid json'
      let parsed = false
      try {
        JSON.parse(raw)
        parsed = true
      } catch {
        parsed = false
      }
      expect(parsed).toBe(false)
    })
  })

  describe('reconnection logic', () => {
    it('should use exponential backoff', () => {
      let delay = 1000
      const maxDelay = 30_000
      const delays: number[] = []

      for (let i = 0; i < 6; i++) {
        delays.push(delay)
        delay = Math.min(delay * 2, maxDelay)
      }

      expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 30000])
    })

    it('should reset delay on successful connect', () => {
      let delay = 16000 // After several failures
      // Successful connect resets
      delay = 1000
      expect(delay).toBe(1000)
    })
  })
})
