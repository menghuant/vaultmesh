import { describe, it, expect } from 'vitest'

describe('Notifications', () => {
  it('should extract filename from path', () => {
    const path = 'docs/readme.md'
    const filename = path.split('/').pop() || path
    expect(filename).toBe('readme.md')
  })

  it('should handle root-level files', () => {
    const path = 'README.md'
    const filename = path.split('/').pop() || path
    expect(filename).toBe('README.md')
  })

  it('should format conflict notification body', () => {
    const path = 'docs/design.md'
    const filename = path.split('/').pop() || path
    const body = `${filename} conflicts with another user's version. Run: vaultmesh conflicts`
    expect(body).toContain('design.md')
    expect(body).toContain('vaultmesh conflicts')
  })

  it('should format permission revoked for single path', () => {
    const paths = ['/hr-confidential/']
    const summary = paths.length === 1
      ? `${paths[0]} removed (permission change)`
      : `${paths.length} paths removed (permission change)`
    expect(summary).toBe('/hr-confidential/ removed (permission change)')
  })

  it('should format permission revoked for multiple paths', () => {
    const paths = ['/hr/', '/finance/', '/legal/']
    const summary = paths.length === 1
      ? `${paths[0]} removed (permission change)`
      : `${paths.length} paths removed (permission change)`
    expect(summary).toBe('3 paths removed (permission change)')
  })

  it('should format reconnected notification', () => {
    const filesSynced = 3
    const body = `Back online. ${filesSynced} files synced.`
    expect(body).toBe('Back online. 3 files synced.')
  })
})
