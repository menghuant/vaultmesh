import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdir, rm, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Mock the home directory so tests don't write to real ~/.vaultmesh
const testDir = join(tmpdir(), `vaultmesh-config-test-${Date.now()}`)

vi.mock('node:os', async () => {
  const actual = await vi.importActual('node:os')
  return { ...actual, homedir: () => testDir }
})

// Import AFTER mock setup
const { loadConfig, saveConfig, deleteConfig, ensureConfigDir, saveSyncState, loadSyncState, getLogPath, rotateLogsIfNeeded } = await import('../config.js')

describe('Config', () => {
  beforeEach(async () => {
    await mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('saveConfig + loadConfig', () => {
    it('should save and load config', async () => {
      const config = {
        serverUrl: 'http://localhost:4000',
        accessToken: 'jwt_token',
        refreshToken: 'refresh_token',
        userId: 'user123',
        tenantId: 'tenant456',
        tenantName: 'acme',
        vaultPath: '/home/user/VaultMesh/acme',
      }

      await saveConfig(config)
      const loaded = await loadConfig()

      expect(loaded).toEqual(config)
    })

    it('should save config with 0o600 permissions', async () => {
      await saveConfig({
        serverUrl: 'http://localhost:4000',
        accessToken: 'jwt',
        refreshToken: 'refresh',
        userId: 'u1',
        tenantId: 't1',
        tenantName: 'test',
        vaultPath: '/tmp/vault',
      })

      const configPath = join(testDir, '.vaultmesh', 'config.json')
      const s = await stat(configPath)
      // 0o600 = owner read+write only
      expect(s.mode & 0o777).toBe(0o600)
    })

    it('should return null when no config exists', async () => {
      const loaded = await loadConfig()
      expect(loaded).toBeNull()
    })
  })

  describe('deleteConfig', () => {
    it('should delete config file', async () => {
      await saveConfig({
        serverUrl: 'http://localhost:4000',
        accessToken: 'jwt',
        refreshToken: 'refresh',
        userId: 'u1',
        tenantId: 't1',
        tenantName: 'test',
        vaultPath: '/tmp/vault',
      })

      await deleteConfig()
      const loaded = await loadConfig()
      expect(loaded).toBeNull()
    })

    it('should not throw when no config exists', async () => {
      await expect(deleteConfig()).resolves.not.toThrow()
    })
  })

  describe('ensureConfigDir', () => {
    it('should create config directory structure', async () => {
      await ensureConfigDir()
      const logsDir = join(testDir, '.vaultmesh', 'logs')
      const conflictsDir = join(testDir, '.vaultmesh', 'conflicts')
      await expect(stat(logsDir)).resolves.toBeDefined()
      await expect(stat(conflictsDir)).resolves.toBeDefined()
    })
  })

  describe('saveSyncState + loadSyncState', () => {
    it('should save and load sync state with 0o600 permissions', async () => {
      await ensureConfigDir()
      const state = { lastSyncAt: '2026-04-01T00:00:00Z', lastCursor: null }
      await saveSyncState(state)
      const loaded = await loadSyncState()
      expect(loaded).toEqual(state)

      const statePath = join(testDir, '.vaultmesh', 'state.json')
      const s = await stat(statePath)
      expect(s.mode & 0o777).toBe(0o600)
    })

    it('should return default state when file does not exist', async () => {
      const loaded = await loadSyncState()
      expect(loaded).toEqual({ lastSyncAt: null, lastCursor: null })
    })
  })

  describe('rotateLogsIfNeeded', () => {
    it('should not throw when no log file exists', async () => {
      await ensureConfigDir()
      await expect(rotateLogsIfNeeded()).resolves.not.toThrow()
    })
  })
})
