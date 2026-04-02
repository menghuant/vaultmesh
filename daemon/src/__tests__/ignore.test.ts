import { describe, it, expect } from 'vitest'
import { IgnoreFilter } from '../ignore.js'

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
})
