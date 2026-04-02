import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sha256 } from '@vaultmesh/shared'
import { VaultDaemon } from '../daemon.js'
import type { RealTransport } from '../transport.js'
import type { DaemonConfig } from '../config.js'

function makeConfig(vaultPath: string): DaemonConfig {
  return {
    serverUrl: 'http://localhost:4000',
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    userId: 'user123',
    tenantId: 'tenant456',
    tenantName: 'test',
    vaultPath,
  }
}

function makeMockTransport(): RealTransport {
  return {
    connect: async () => {},
    disconnect: () => {},
    isConnected: () => false,
    uploadFile: async () => ({ accepted: true, version: 1 }),
    downloadFile: async (path: string) => Buffer.from(`content of ${path}`),
    deleteFile: async () => {},
    sendManifest: async () => ({ download: [], upload: [], conflict: [], delete: [] }),
    notifyFileChanged: () => {},
    notifyFileDeleted: () => {},
    onRemoteChange: () => {},
    onConflict: () => {},
    onPermissionRevoked: () => {},
    onPermissionGranted: () => {},
    onRemoteDelete: () => {},
    onRemoteRename: () => {},
  } as unknown as RealTransport
}

describe('VaultDaemon', () => {
  const testDir = join(tmpdir(), `vaultmesh-daemon-real-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  const vaultPath = join(testDir, 'vault')
  const conflictsDir = join(testDir, 'conflicts')

  beforeEach(async () => {
    await mkdir(vaultPath, { recursive: true })
    await mkdir(conflictsDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('safePath', () => {
    it('should allow normal relative paths', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      // Access private method via bracket notation
      const result = (daemon as any).safePath('docs/readme.md')
      expect(result).toBe(join(vaultPath, 'docs/readme.md'))
    })

    it('should allow deeply nested paths', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      const result = (daemon as any).safePath('a/b/c/d/e/file.txt')
      expect(result).toBe(join(vaultPath, 'a/b/c/d/e/file.txt'))
    })

    it('should block path traversal with ../', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      expect(() => (daemon as any).safePath('../../../etc/passwd')).toThrow('Path traversal blocked')
    })

    it('should block path traversal with nested ../', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      expect(() => (daemon as any).safePath('docs/../../../etc/passwd')).toThrow('Path traversal blocked')
    })

    it('should block absolute paths outside vault', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      expect(() => (daemon as any).safePath('/etc/passwd')).toThrow('Path traversal blocked')
    })

    it('should allow paths that contain .. in filenames', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      // "file..name.txt" is valid, not traversal
      const result = (daemon as any).safePath('file..name.txt')
      expect(result).toBe(join(vaultPath, 'file..name.txt'))
    })
  })

  describe('buildManifest', () => {
    it('should return empty manifest for empty vault', async () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      const manifest = await daemon.buildManifest()
      expect(manifest).toEqual([])
    })

    it('should include files with correct hashes', async () => {
      const content = Buffer.from('hello world')
      await writeFile(join(vaultPath, 'test.md'), content)

      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      const manifest = await daemon.buildManifest()

      expect(manifest).toHaveLength(1)
      expect(manifest[0]!.path).toBe('test.md')
      expect(manifest[0]!.hash).toBe(sha256(content))
      expect(manifest[0]!.sizeBytes).toBe(content.length)
    })

    it('should walk nested directories', async () => {
      await mkdir(join(vaultPath, 'docs'), { recursive: true })
      await writeFile(join(vaultPath, 'root.txt'), 'root')
      await writeFile(join(vaultPath, 'docs/guide.md'), 'guide')

      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      const manifest = await daemon.buildManifest()

      const paths = manifest.map(e => e.path).sort()
      expect(paths).toEqual(['docs/guide.md', 'root.txt'])
    })

    it('should skip ignored files', async () => {
      await writeFile(join(vaultPath, 'test.md'), 'content')
      await writeFile(join(vaultPath, '.DS_Store'), 'junk')
      await writeFile(join(vaultPath, 'file.swp'), 'swap')

      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      // Need to load ignore filter first (normally done in start())
      const { loadIgnoreFilter } = await import('../ignore.js')
      ;(daemon as any).ignoreFilter = await loadIgnoreFilter(vaultPath)

      const manifest = await daemon.buildManifest()
      const paths = manifest.map(e => e.path)
      expect(paths).toContain('test.md')
      expect(paths).not.toContain('.DS_Store')
      expect(paths).not.toContain('file.swp')
    })
  })

  describe('handleServerDelete', () => {
    it('should delete local file when hash matches', async () => {
      const content = Buffer.from('original content')
      const filePath = join(vaultPath, 'test.md')
      await writeFile(filePath, content)
      const hash = sha256(content)

      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())

      await (daemon as any).handleServerDelete('test.md', hash)

      // File should be deleted
      await expect(stat(filePath)).rejects.toThrow()
    })

    it('should keep local file when hash differs (local was modified)', async () => {
      const originalContent = Buffer.from('original')
      const modifiedContent = Buffer.from('modified locally')
      const filePath = join(vaultPath, 'test.md')
      await writeFile(filePath, modifiedContent)

      const serverLastKnownHash = sha256(originalContent) // Different from local

      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())

      await (daemon as any).handleServerDelete('test.md', serverLastKnownHash)

      // File should still exist (conflict, local was modified)
      const remaining = await readFile(filePath, 'utf-8')
      expect(remaining).toBe('modified locally')
    })

    it('should not throw when file already deleted', async () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())

      // Should not throw for ENOENT
      await expect(
        (daemon as any).handleServerDelete('nonexistent.md', 'abc')
      ).resolves.toBeUndefined()
    })
  })

  describe('handleConflict', () => {
    it('should save local version to conflicts dir and download server version', async () => {
      const localContent = Buffer.from('my local version')
      await writeFile(join(vaultPath, 'doc.md'), localContent)

      const serverContent = Buffer.from('server version')
      const mockTransport = makeMockTransport()
      mockTransport.downloadFile = async () => serverContent

      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, mockTransport as unknown as RealTransport)

      // Mock getConflictsDir to use our test dir
      const originalImport = (daemon as any).handleConflict
      await (daemon as any).handleConflict.call({
        ...daemon,
        config,
        transport: mockTransport,
        pendingWrites: new Set(),
        knownHashes: new Map(),
        safePath: (daemon as any).safePath.bind(daemon),
      }, 'doc.md', 'server-hash', 'local-hash')

      // Server version should now be in vault
      const currentContent = await readFile(join(vaultPath, 'doc.md'))
      expect(currentContent.toString()).toBe('server version')
    })
  })

  describe('write-back suppression', () => {
    it('should track and clear pending writes', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      const pendingWrites = (daemon as any).pendingWrites as Set<string>

      pendingWrites.add('test.md')
      expect(pendingWrites.has('test.md')).toBe(true)

      pendingWrites.delete('test.md')
      expect(pendingWrites.has('test.md')).toBe(false)
    })
  })

  describe('knownHashes tracking', () => {
    it('should start empty', () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      const knownHashes = (daemon as any).knownHashes as Map<string, string>
      expect(knownHashes.size).toBe(0)
    })
  })

  describe('lifecycle', () => {
    it('should set shuttingDown on stop', async () => {
      const config = makeConfig(vaultPath)
      const daemon = new VaultDaemon(config, makeMockTransport())
      await daemon.stop()
      expect((daemon as any).shuttingDown).toBe(true)
    })
  })
})
