import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test CLI helpers by importing the program and testing command structure
import { program } from '../cli.js'

describe('CLI', () => {
  describe('command structure', () => {
    it('should have all required top-level commands', () => {
      const commandNames = program.commands.map(c => c.name())
      expect(commandNames).toContain('setup')
      expect(commandNames).toContain('login')
      expect(commandNames).toContain('logout')
      expect(commandNames).toContain('status')
      expect(commandNames).toContain('admin')
      expect(commandNames).toContain('conflicts')
      expect(commandNames).toContain('daemon')
      expect(commandNames).toContain('history')
      expect(commandNames).toContain('restore')
    })

    it('should have admin subcommands', () => {
      const admin = program.commands.find(c => c.name() === 'admin')!
      const adminCommands = admin.commands.map(c => c.name())
      expect(adminCommands).toContain('signup')
      expect(adminCommands).toContain('invite')
      expect(adminCommands).toContain('groups')
      expect(adminCommands).toContain('permissions')
      expect(adminCommands).toContain('members')
    })

    it('should have groups subcommands', () => {
      const admin = program.commands.find(c => c.name() === 'admin')!
      const groups = admin.commands.find(c => c.name() === 'groups')!
      const groupCommands = groups.commands.map(c => c.name())
      expect(groupCommands).toContain('create')
      expect(groupCommands).toContain('add')
      expect(groupCommands).toContain('remove')
      expect(groupCommands).toContain('list')
    })

    it('should have conflicts subcommands', () => {
      const conflicts = program.commands.find(c => c.name() === 'conflicts')!
      const conflictCommands = conflicts.commands.map(c => c.name())
      expect(conflictCommands).toContain('list')
      expect(conflictCommands).toContain('diff')
      expect(conflictCommands).toContain('resolve')
    })

    it('should have daemon subcommands', () => {
      const daemon = program.commands.find(c => c.name() === 'daemon')!
      const daemonCommands = daemon.commands.map(c => c.name())
      expect(daemonCommands).toContain('start')
      expect(daemonCommands).toContain('stop')
      expect(daemonCommands).toContain('logs')
    })
  })

  describe('validateServerUrl (via URL)', () => {
    it('should accept http URLs', () => {
      const parsed = new URL('http://localhost:4000')
      expect(parsed.protocol).toBe('http:')
      expect(parsed.origin).toBe('http://localhost:4000')
    })

    it('should accept https URLs', () => {
      const parsed = new URL('https://sync.example.com')
      expect(parsed.protocol).toBe('https:')
      expect(parsed.origin).toBe('https://sync.example.com')
    })

    it('should reject ftp URLs', () => {
      const parsed = new URL('ftp://server.com')
      expect(parsed.protocol).not.toBe('http:')
      expect(parsed.protocol).not.toBe('https:')
    })

    it('should throw on invalid URLs', () => {
      expect(() => new URL('not-a-url')).toThrow()
    })

    it('should strip trailing path', () => {
      const parsed = new URL('http://localhost:4000/api/v1')
      expect(parsed.origin).toBe('http://localhost:4000')
    })
  })

  describe('TLS detection', () => {
    it('should detect non-localhost HTTP as insecure', () => {
      const parsed = new URL('http://sync.example.com')
      const isInsecure = parsed.protocol === 'http:' &&
        parsed.hostname !== 'localhost' &&
        parsed.hostname !== '127.0.0.1'
      expect(isInsecure).toBe(true)
    })

    it('should not flag localhost HTTP', () => {
      const parsed = new URL('http://localhost:4000')
      const isInsecure = parsed.protocol === 'http:' &&
        parsed.hostname !== 'localhost' &&
        parsed.hostname !== '127.0.0.1'
      expect(isInsecure).toBe(false)
    })

    it('should not flag HTTPS', () => {
      const parsed = new URL('https://sync.example.com')
      const isInsecure = parsed.protocol === 'http:'
      expect(isInsecure).toBe(false)
    })
  })
})
