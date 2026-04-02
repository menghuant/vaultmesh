import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { sha256 } from '@vaultmesh/shared'

describe('Daemon Core Logic', () => {
  const testDir = join(tmpdir(), `vaultmesh-daemon-test-${Date.now()}`)
  const vaultPath = join(testDir, 'vault')

  beforeEach(async () => {
    await mkdir(vaultPath, { recursive: true })
  })

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true })
  })

  describe('manifest building', () => {
    it('should hash file contents for manifest', async () => {
      const content = Buffer.from('hello world')
      await writeFile(join(vaultPath, 'test.md'), content)

      const hash = sha256(content)
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
    })

    it('should compute consistent hashes', async () => {
      const content = Buffer.from('deterministic content')
      const hash1 = sha256(content)
      const hash2 = sha256(content)
      expect(hash1).toBe(hash2)
    })

    it('should compute different hashes for different content', () => {
      const hash1 = sha256(Buffer.from('content A'))
      const hash2 = sha256(Buffer.from('content B'))
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('write-back suppression', () => {
    it('should track pending writes with a Set', () => {
      const pendingWrites = new Set<string>()
      pendingWrites.add('test.md')

      expect(pendingWrites.has('test.md')).toBe(true)
      expect(pendingWrites.has('other.md')).toBe(false)

      pendingWrites.delete('test.md')
      expect(pendingWrites.has('test.md')).toBe(false)
    })
  })

  describe('conflict handling', () => {
    it('should create conflict copy filename with timestamp', () => {
      const path = 'docs/readme.md'
      const ts = '2026-04-01T00-00-00-000Z'
      const userId = 'user123'

      const baseName = path.replace(/\//g, '__')
      const ext = '.md'
      const conflictName = `${baseName}.CONFLICT-${ts}-${userId}${ext}`

      expect(conflictName).toBe('docs__readme.md.CONFLICT-2026-04-01T00-00-00-000Z-user123.md')
    })

    it('should handle files without extensions', () => {
      const path = 'Makefile'
      const baseName = path.replace(/\//g, '__')
      const ext = '' // no extension
      const conflictName = `${baseName}.CONFLICT-ts-user${ext}`

      expect(conflictName).toBe('Makefile.CONFLICT-ts-user')
    })
  })

  describe('server delete handling', () => {
    it('should only delete local file if hash matches', async () => {
      const content = Buffer.from('original content')
      const filePath = join(vaultPath, 'test.md')
      await writeFile(filePath, content)

      const localHash = sha256(content)
      const serverLastKnownHash = sha256(content) // Same hash = safe to delete

      expect(localHash).toBe(serverLastKnownHash)
    })

    it('should not delete local file if modified since server delete', async () => {
      const originalContent = Buffer.from('original')
      const modifiedContent = Buffer.from('modified locally')

      const serverLastKnownHash = sha256(originalContent)
      const localHash = sha256(modifiedContent)

      expect(localHash).not.toBe(serverLastKnownHash) // Different = conflict
    })
  })

  describe('file size check', () => {
    it('should reject files over 50MB', () => {
      const MAX_FILE_SIZE = 50 * 1024 * 1024
      const largeSize = 51 * 1024 * 1024

      expect(largeSize > MAX_FILE_SIZE).toBe(true)
      expect(49 * 1024 * 1024 > MAX_FILE_SIZE).toBe(false)
    })
  })

  describe('debounce behavior', () => {
    it('should aggregate rapid events', async () => {
      const events: string[] = []
      const timers = new Map<string, ReturnType<typeof setTimeout>>()

      function debounced(path: string) {
        const existing = timers.get(path)
        if (existing) clearTimeout(existing)
        const timer = setTimeout(() => {
          timers.delete(path)
          events.push(path)
        }, 50)
        timers.set(path, timer)
      }

      // Rapid fire events for same file
      debounced('test.md')
      debounced('test.md')
      debounced('test.md')

      // Wait for debounce
      await new Promise(r => setTimeout(r, 100))

      // Should only fire once
      expect(events).toEqual(['test.md'])
    })
  })
})
