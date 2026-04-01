import { describe, it, expect } from 'vitest'
import {
  sha256, generateId, normalizePath, normalizeFolderPath,
  pathsCollide, isUnderFolder,
  encodeInviteToken, decodeInviteToken, generateSecret,
} from './utils.js'

describe('sha256', () => {
  it('returns consistent hash for same input', () => {
    const hash1 = sha256('hello')
    const hash2 = sha256('hello')
    expect(hash1).toBe(hash2)
    expect(hash1).toHaveLength(64) // hex SHA-256
  })

  it('returns different hashes for different inputs', () => {
    expect(sha256('hello')).not.toBe(sha256('world'))
  })

  it('works with Buffer input', () => {
    const hash = sha256(Buffer.from('hello'))
    expect(hash).toBe(sha256('hello'))
  })
})

describe('generateId', () => {
  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()))
    expect(ids.size).toBe(100)
  })

  it('generates IDs of specified length', () => {
    expect(generateId(10)).toHaveLength(10)
    expect(generateId(21)).toHaveLength(21)
  })
})

describe('normalizePath', () => {
  it('removes leading slash', () => {
    expect(normalizePath('/docs/readme.md')).toBe('docs/readme.md')
  })

  it('removes trailing slash', () => {
    expect(normalizePath('docs/readme.md/')).toBe('docs/readme.md')
  })

  it('converts backslashes to forward slashes', () => {
    expect(normalizePath('docs\\readme.md')).toBe('docs/readme.md')
  })

  it('removes double slashes', () => {
    expect(normalizePath('docs//readme.md')).toBe('docs/readme.md')
  })
})

describe('normalizeFolderPath', () => {
  it('adds leading and trailing slashes', () => {
    expect(normalizeFolderPath('docs')).toBe('/docs/')
  })

  it('handles root path', () => {
    expect(normalizeFolderPath('/')).toBe('/')
  })

  it('keeps already-normalized paths', () => {
    expect(normalizeFolderPath('/docs/')).toBe('/docs/')
  })
})

describe('pathsCollide', () => {
  it('detects case-insensitive collisions', () => {
    expect(pathsCollide('README.md', 'readme.md')).toBe(true)
  })

  it('does not flag identical paths', () => {
    expect(pathsCollide('README.md', 'README.md')).toBe(false)
  })

  it('does not flag truly different paths', () => {
    expect(pathsCollide('README.md', 'CHANGELOG.md')).toBe(false)
  })
})

describe('isUnderFolder', () => {
  it('root folder contains everything', () => {
    expect(isUnderFolder('docs/readme.md', '/')).toBe(true)
    expect(isUnderFolder('a/b/c.txt', '/')).toBe(true)
  })

  it('detects files under a folder', () => {
    expect(isUnderFolder('docs/readme.md', '/docs/')).toBe(true)
    expect(isUnderFolder('docs/api/endpoints.md', '/docs/')).toBe(true)
  })

  it('rejects files not under a folder', () => {
    expect(isUnderFolder('src/index.ts', '/docs/')).toBe(false)
  })

  it('handles edge case: folder name prefix', () => {
    // "docs-archive/..." should NOT be under "/docs/"
    expect(isUnderFolder('docs-archive/old.md', '/docs/')).toBe(false)
  })
})

describe('invite token encoding', () => {
  it('roundtrips encode/decode', () => {
    const data = {
      serverUrl: 'https://vault.example.com',
      secret: generateSecret(),
      expiresAt: new Date().toISOString(),
    }
    const token = encodeInviteToken(data)
    expect(token).toMatch(/^vmsh_inv_/)

    const decoded = decodeInviteToken(token)
    expect(decoded).toEqual(data)
  })

  it('returns null for invalid tokens', () => {
    expect(decodeInviteToken('invalid')).toBeNull()
    expect(decodeInviteToken('vmsh_inv_!!!invalid-base64')).toBeNull()
  })
})
