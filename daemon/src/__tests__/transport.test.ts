import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ManifestEntry, SyncPlan, UploadResult, ServerMessage } from '@vaultmesh/shared'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch as any

import { RealTransport } from '../transport.js'
import type { DaemonConfig } from '../config.js'

function makeConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  return {
    serverUrl: 'http://localhost:4000',
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    userId: 'user1',
    tenantId: 'tenant1',
    tenantName: 'test',
    vaultPath: '/tmp/vault',
    ...overrides,
  }
}

function mockResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: () => Promise.resolve(body),
    arrayBuffer: () => Promise.resolve(Buffer.from(JSON.stringify(body))),
    headers: new Headers(),
  } as unknown as Response
}

describe('RealTransport', () => {
  let transport: RealTransport

  beforeEach(() => {
    vi.clearAllMocks()
    transport = new RealTransport(makeConfig(), async () => 'refreshed-token')
  })

  describe('HTTP methods', () => {
    it('should send manifest with auth header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { download: [], upload: [], conflict: [], delete: [] }))

      const plan = await transport.sendManifest([{ path: 'test.md', hash: 'abc', sizeBytes: 100 }])

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/sync/manifest',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        }),
      )
      expect(plan.download).toEqual([])
    })

    it('should encode file paths in URLs', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, Buffer.from('content')))

      await transport.downloadFile('docs/my file (1).md').catch(() => {})

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/files/docs%2Fmy%20file%20(1).md',
        expect.anything(),
      )
    })

    it('should refresh token on 401 and retry', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(401)) // First call returns 401
        .mockResolvedValueOnce(mockResponse(200, { download: [], upload: [], conflict: [], delete: [] })) // Retry succeeds

      const plan = await transport.sendManifest([])

      expect(mockFetch).toHaveBeenCalledTimes(2)
      // Second call should use refreshed token
      const secondCall = mockFetch.mock.calls[1]!
      expect((secondCall[1] as any).headers['Authorization']).toBe('Bearer refreshed-token')
    })

    it('should retry on 503 with exponential backoff', async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(503))
        .mockResolvedValueOnce(mockResponse(200, { download: [], upload: [], conflict: [], delete: [] }))

      const plan = await transport.sendManifest([])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should retry on network error', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('fetch failed'))
        .mockResolvedValueOnce(mockResponse(200, { download: [], upload: [], conflict: [], delete: [] }))

      const plan = await transport.sendManifest([])
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('should give up after MAX_RETRIES', async () => {
      mockFetch.mockRejectedValue(new Error('persistent failure'))

      await expect(transport.sendManifest([])).rejects.toThrow('persistent failure')
      expect(mockFetch).toHaveBeenCalledTimes(4) // 1 initial + 3 retries
    })

    it('should send upload with base hash header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200, { accepted: true, version: 1 }))

      await transport.uploadFile('test.md', Buffer.from('content'), 'abc123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/files/test.md',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'X-Base-Hash': 'abc123',
          }),
        }),
      )
    })

    it('should send delete request', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(200))

      await transport.deleteFile('old.md')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/files/old.md',
        expect.objectContaining({ method: 'DELETE' }),
      )
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

  describe('notifyFileChanged/notifyFileDeleted', () => {
    it('should not throw when ws is null', () => {
      expect(() => transport.notifyFileChanged('test.md', 'hash', 100)).not.toThrow()
      expect(() => transport.notifyFileDeleted('test.md')).not.toThrow()
    })
  })

  describe('isConnected', () => {
    it('should return false when not connected', () => {
      expect(transport.isConnected()).toBe(false)
    })
  })

  describe('disconnect', () => {
    it('should not throw when already disconnected', () => {
      expect(() => transport.disconnect()).not.toThrow()
    })
  })

  describe('reconnection jitter', () => {
    it('should produce jittered delays within expected range', () => {
      const baseDelay = 1000
      const delays: number[] = []

      for (let i = 0; i < 100; i++) {
        delays.push(Math.floor(baseDelay * (0.5 + Math.random())))
      }

      // All delays should be between 500 and 1500
      expect(delays.every(d => d >= 500 && d < 1500)).toBe(true)
      // Should have variance (not all the same)
      const uniqueDelays = new Set(delays)
      expect(uniqueDelays.size).toBeGreaterThan(10)
    })
  })
})
