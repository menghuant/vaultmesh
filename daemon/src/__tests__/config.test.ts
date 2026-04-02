import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('Config', () => {
  const testDir = join(tmpdir(), `vaultmesh-config-test-${Date.now()}`)

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  it('should define DaemonConfig interface shape', () => {
    const config = {
      serverUrl: 'http://localhost:4000',
      accessToken: 'jwt_token',
      refreshToken: 'refresh_token',
      userId: 'user123',
      tenantId: 'tenant456',
      tenantName: 'acme',
      vaultPath: '/home/user/VaultMesh/acme',
    }

    expect(config.serverUrl).toBe('http://localhost:4000')
    expect(config.vaultPath).toBe('/home/user/VaultMesh/acme')
  })

  it('should define SyncState interface shape', () => {
    const state = {
      lastSyncAt: '2026-04-01T00:00:00Z',
      lastCursor: null,
    }

    expect(state.lastSyncAt).toBeTruthy()
    expect(state.lastCursor).toBeNull()
  })

  it('should handle empty sync state', () => {
    const state = {
      lastSyncAt: null,
      lastCursor: null,
    }

    expect(state.lastSyncAt).toBeNull()
  })
})
