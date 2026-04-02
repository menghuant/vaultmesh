import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock child_process.execFile before importing
vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null) => void) => {
    cb(null)
  }),
}))

// Import real functions
import { notify, notifyFileSync, notifyConflict, notifyPermissionRevoked, notifyReconnected, notifySetupComplete } from '../notifications.js'
import { execFile } from 'node:child_process'

const mockedExecFile = vi.mocked(execFile)

describe('Notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Force platform to darwin for testing
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })

  describe('notify()', () => {
    it('should call osascript on macOS', () => {
      notify('Test Title', 'Test Body')
      expect(mockedExecFile).toHaveBeenCalledWith(
        'osascript',
        ['-e', expect.stringContaining('display notification')],
        expect.any(Function),
      )
    })

    it('should sanitize double quotes from title and body', () => {
      notify('Title with "quotes"', 'Body with "quotes"')
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).not.toContain('"quotes"')
    })

    it('should sanitize backslashes', () => {
      notify('Title', 'path\\to\\file')
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).not.toContain('\\')
    })

    it('should sanitize backticks and single quotes', () => {
      notify('Title', "body with `backtick` and 'quote'")
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).not.toContain('`')
      expect(scriptArg).not.toContain("'")
    })

    it('should skip on non-macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      notify('Title', 'Body')
      expect(mockedExecFile).not.toHaveBeenCalled()
    })
  })

  describe('notifyFileSync()', () => {
    it('should extract filename from path', () => {
      notifyFileSync('docs/readme.md', 'alice')
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).toContain('readme.md')
      expect(scriptArg).toContain('alice')
    })
  })

  describe('notifyConflict()', () => {
    it('should include conflict info', () => {
      notifyConflict('docs/design.md', 'bob')
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).toContain('design.md')
      expect(scriptArg).toContain('bob')
    })
  })

  describe('notifyPermissionRevoked()', () => {
    it('should handle single path', () => {
      notifyPermissionRevoked(['/hr-confidential/'])
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).toContain('/hr-confidential/')
    })

    it('should handle multiple paths', () => {
      notifyPermissionRevoked(['/hr/', '/finance/', '/legal/'])
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).toContain('3 paths')
    })
  })

  describe('notifyReconnected()', () => {
    it('should show files synced count', () => {
      notifyReconnected(3)
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).toContain('3 files synced')
    })
  })

  describe('notifySetupComplete()', () => {
    it('should show vault path and file count', () => {
      notifySetupComplete('~/VaultMesh/acme', 847)
      const scriptArg = mockedExecFile.mock.calls[0]![1]![1]!
      expect(scriptArg).toContain('847')
    })
  })
})
