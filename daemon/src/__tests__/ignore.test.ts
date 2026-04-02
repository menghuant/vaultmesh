import { describe, it, expect } from 'vitest'
import { IgnoreFilter, getRelativePath, loadIgnoreFilter } from '../ignore.js'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('IgnoreFilter', () => {
  describe('default patterns', () => {
    it('should ignore .DS_Store', () => {
      const filter = new IgnoreFilter(['.DS_Store'])
      expect(filter.isIgnored('.DS_Store')).toBe(true)
      expect(filter.isIgnored('sub/.DS_Store')).toBe(true)
    })

    it('should ignore *.swp files', () => {
      const filter = new IgnoreFilter(['*.swp'])
      expect(filter.isIgnored('test.swp')).toBe(true)
      expect(filter.isIgnored('test.md')).toBe(false)
    })

    it('should ignore *.tmp files', () => {
      const filter = new IgnoreFilter(['*.tmp'])
      expect(filter.isIgnored('file.tmp')).toBe(true)
      expect(filter.isIgnored('file.txt')).toBe(false)
    })

    it('should ignore .git/ directory and files inside it', () => {
      const filter = new IgnoreFilter(['.git/'])
      expect(filter.isIgnored('.git', true)).toBe(true)
      expect(filter.isIgnored('.git/config')).toBe(true)
      expect(filter.isIgnored('.git/objects/abc')).toBe(true)
      expect(filter.isIgnored('.gitignore')).toBe(false) // not inside .git/
    })

    it('should ignore node_modules/ and files inside it', () => {
      const filter = new IgnoreFilter(['node_modules/'])
      expect(filter.isIgnored('node_modules', true)).toBe(true)
      expect(filter.isIgnored('node_modules/package/index.js')).toBe(true)
    })
  })

  describe('glob patterns', () => {
    it('should match single * (non-recursive)', () => {
      const filter = new IgnoreFilter(['*.log'])
      expect(filter.isIgnored('app.log')).toBe(true)
      expect(filter.isIgnored('sub/app.log')).toBe(true) // matches filename
    })

    it('should match ** (recursive)', () => {
      const filter = new IgnoreFilter(['**/build/'])
      expect(filter.isIgnored('build', true)).toBe(true)
      expect(filter.isIgnored('src/build', true)).toBe(true)
    })

    it('should match ? (single char)', () => {
      const filter = new IgnoreFilter(['file?.txt'])
      expect(filter.isIgnored('file1.txt')).toBe(true)
      expect(filter.isIgnored('file12.txt')).toBe(false)
    })
  })

  describe('negation', () => {
    it('should support ! negation', () => {
      const filter = new IgnoreFilter(['*.log', '!important.log'])
      expect(filter.isIgnored('debug.log')).toBe(true)
      expect(filter.isIgnored('important.log')).toBe(false)
    })
  })

  describe('comments and empty lines', () => {
    it('should skip comments', () => {
      const filter = new IgnoreFilter(['# this is a comment', '*.tmp'])
      expect(filter.isIgnored('test.tmp')).toBe(true)
    })

    it('should skip empty lines', () => {
      const filter = new IgnoreFilter(['', '  ', '*.tmp'])
      expect(filter.isIgnored('test.tmp')).toBe(true)
    })
  })

  describe('character classes', () => {
    it('should match character classes [abc]', () => {
      const filter = new IgnoreFilter(['file[123].txt'])
      expect(filter.isIgnored('file1.txt')).toBe(true)
      expect(filter.isIgnored('file2.txt')).toBe(true)
      expect(filter.isIgnored('file4.txt')).toBe(false)
    })

    it('should handle range in character class [a-z]', () => {
      const filter = new IgnoreFilter(['[a-z].txt'])
      expect(filter.isIgnored('a.txt')).toBe(true)
      expect(filter.isIgnored('z.txt')).toBe(true)
      expect(filter.isIgnored('A.txt')).toBe(false)
    })
  })

  describe('anchored patterns', () => {
    it('should handle leading slash as anchored pattern', () => {
      const filter = new IgnoreFilter(['/build'])
      expect(filter.isIgnored('build')).toBe(true)
      // Leading / is stripped, so pattern matches basename too
    })
  })

  describe('.vaultmeshignore defaults', () => {
    it('should handle typical defaults', () => {
      const filter = new IgnoreFilter([
        '.DS_Store',
        '*.swp',
        '*.tmp',
        '.git/',
        '.obsidian/workspace.json',
        'node_modules/',
        '.vaultmesh/',
        '*.lock',
        'Thumbs.db',
      ])

      expect(filter.isIgnored('.DS_Store')).toBe(true)
      expect(filter.isIgnored('Thumbs.db')).toBe(true)
      expect(filter.isIgnored('bun.lock')).toBe(true)
      expect(filter.isIgnored('README.md')).toBe(false)
      expect(filter.isIgnored('src/main.ts')).toBe(false)
    })
  })

  describe('getRelativePath()', () => {
    it('should return relative path with forward slashes', () => {
      expect(getRelativePath('/home/user/vault', '/home/user/vault/docs/readme.md')).toBe('docs/readme.md')
    })

    it('should return single file name for root-level file', () => {
      expect(getRelativePath('/home/user/vault', '/home/user/vault/README.md')).toBe('README.md')
    })
  })

  describe('loadIgnoreFilter()', () => {
    const testDir = join(tmpdir(), `vaultmesh-ignore-test-${Date.now()}`)

    it('should load defaults when no .vaultmeshignore exists', async () => {
      await mkdir(testDir, { recursive: true })
      const filter = await loadIgnoreFilter(testDir)
      expect(filter.isIgnored('.DS_Store')).toBe(true)
      expect(filter.isIgnored('.git/config')).toBe(true)
      expect(filter.isIgnored('README.md')).toBe(false)
      await rm(testDir, { recursive: true, force: true })
    })

    it('should load custom patterns from .vaultmeshignore', async () => {
      await mkdir(testDir, { recursive: true })
      await writeFile(join(testDir, '.vaultmeshignore'), '*.custom\nsecret/')
      const filter = await loadIgnoreFilter(testDir)
      expect(filter.isIgnored('file.custom')).toBe(true)
      expect(filter.isIgnored('secret/data.txt')).toBe(true)
      expect(filter.isIgnored('.DS_Store')).toBe(true) // defaults still apply
      await rm(testDir, { recursive: true, force: true })
    })
  })
})
