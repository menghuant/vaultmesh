import { Command } from 'commander'
import { readFile, writeFile, unlink, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { decodeInviteToken, log, setLogLevel } from '@vaultmesh/shared'
import {
  loadConfig, saveConfig, deleteConfig, ensureConfigDir,
  getPidPath, getLogPath, getConflictsDir,
  type DaemonConfig,
} from './config.js'

const program = new Command()
  .name('vaultmesh')
  .description('VaultMesh — file sync for teams')
  .version('0.1.0')

// ── Helpers ─────────────────────────────────────────────

function green(s: string): string { return `\x1b[32m${s}\x1b[0m` }
function red(s: string): string { return `\x1b[31m${s}\x1b[0m` }
function yellow(s: string): string { return `\x1b[33m${s}\x1b[0m` }
function dim(s: string): string { return `\x1b[2m${s}\x1b[0m` }
function bold(s: string): string { return `\x1b[1m${s}\x1b[0m` }

function success(msg: string): void { console.log(`${green('✓')} ${msg}`) }
function error(msg: string): void { console.error(`${red('✗')} ${msg}`) }
function warn(msg: string): void { console.log(`${yellow('!')} ${msg}`) }

function validateServerUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      error(`Server URL must use http:// or https:// (got ${parsed.protocol})`)
      process.exit(1)
    }
    return parsed.origin
  } catch {
    error(`Invalid server URL: ${url}`)
    process.exit(1)
  }
}

async function requireConfig(): Promise<DaemonConfig> {
  const config = await loadConfig()
  if (!config) {
    error('Not connected to any vault. Run: vaultmesh setup --token <token>')
    process.exit(1)
  }
  return config
}

async function apiRequest(config: DaemonConfig, path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${config.serverUrl}${path}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${config.accessToken}`,
    ...((options.headers as Record<string, string>) || {}),
  }

  const res = await fetch(url, { ...options, headers })

  // Auto-refresh on 401
  if (res.status === 401) {
    const refreshed = await refreshToken(config)
    if (refreshed) {
      headers['Authorization'] = `Bearer ${config.accessToken}`
      return fetch(url, { ...options, headers })
    }
  }

  return res
}

async function refreshToken(config: DaemonConfig): Promise<boolean> {
  try {
    const res = await fetch(`${config.serverUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: config.refreshToken }),
    })

    if (!res.ok) return false

    const data = await res.json() as { accessToken: string; refreshToken: string }
    config.accessToken = data.accessToken
    config.refreshToken = data.refreshToken
    await saveConfig(config)
    return true
  } catch {
    return false
  }
}

// ── setup ───────────────────────────────────────────────

program
  .command('setup')
  .description('Set up VaultMesh with an invite token')
  .requiredOption('--token <token>', 'Invite token from your admin')
  .option('--path <dir>', 'Custom vault path')
  .action(async (opts: { token: string; path?: string }) => {
    const existing = await loadConfig()
    if (existing) {
      warn(`Already connected to "${existing.tenantName}". To switch: vaultmesh logout && vaultmesh setup --token <new>`)
      process.exit(1)
    }

    const tokenData = decodeInviteToken(opts.token)
    if (!tokenData) {
      error('Invalid or expired invite token. Ask admin for new: vaultmesh admin invite --email you@co.com')
      process.exit(1)
    }

    // Prompt for password
    const password = await promptPassword('Set your password: ')
    if (!password || password.length < 8) {
      error('Password must be at least 8 characters')
      process.exit(1)
    }

    try {
      const res = await fetch(`${tokenData.serverUrl}/api/auth/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: opts.token, password }),
      })

      if (!res.ok) {
        const body = await res.json() as { message?: string }
        error(body.message || `Setup failed (${res.status})`)
        process.exit(1)
      }

      const data = await res.json() as { accessToken: string; refreshToken: string; userId: string; tenantId: string }

      const tenantName = data.tenantId.slice(0, 8) // Fallback

      const vaultPath = opts.path || join(homedir(), 'VaultMesh', tenantName)

      await ensureConfigDir()
      await saveConfig({
        serverUrl: tokenData.serverUrl,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: data.userId,
        tenantId: data.tenantId,
        tenantName,
        vaultPath,
      })

      success(`Token verified. Connected to tenant ${dim(data.tenantId.slice(0, 8))}.`)
      success(`Your vault: ${bold(vaultPath)}`)
      console.log(`${dim('Run: vaultmesh daemon start')}`)
    } catch (err) {
      error(`Connection failed: ${err}`)
      process.exit(1)
    }
  })

// ── login ───────────────────────────────────────────────

program
  .command('login')
  .description('Log in to an existing account')
  .requiredOption('--email <email>', 'Your email')
  .requiredOption('--server <url>', 'Server URL')
  .requiredOption('--tenant <id>', 'Tenant ID')
  .option('--path <dir>', 'Custom vault path')
  .action(async (opts: { email: string; server: string; tenant: string; path?: string }) => {
    const serverUrl = validateServerUrl(opts.server)
    const password = await promptPassword('Password: ')

    try {
      const res = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: opts.email, password, tenantId: opts.tenant }),
      })

      if (!res.ok) {
        const body = await res.json() as { message?: string }
        error(body.message || 'Login failed')
        process.exit(1)
      }

      const data = await res.json() as { accessToken: string; refreshToken: string; userId: string; tenantId: string }
      const tenantName = data.tenantId.slice(0, 8)
      const vaultPath = opts.path || join(homedir(), 'VaultMesh', tenantName)

      await ensureConfigDir()
      await saveConfig({
        serverUrl: serverUrl,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: data.userId,
        tenantId: data.tenantId,
        tenantName,
        vaultPath,
      })

      success(`Logged in. Your vault: ${bold(vaultPath)}`)
    } catch (err) {
      error(`Login failed: ${err}`)
      process.exit(1)
    }
  })

// ── logout ──────────────────────────────────────────────

program
  .command('logout')
  .description('Log out and stop daemon')
  .action(async () => {
    // Stop daemon if running
    await stopDaemonProcess()
    await deleteConfig()
    success('Logged out.')
  })

// ── status ──────────────────────────────────────────────

program
  .command('status')
  .description('Show sync status')
  .action(async () => {
    const config = await requireConfig()

    // Check server health
    let serverStatus = 'unreachable'
    try {
      const res = await fetch(`${config.serverUrl}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as { status: string; db: string }
        serverStatus = data.status === 'ok' ? 'connected' : 'degraded'
      }
    } catch {}

    // Check daemon PID
    const daemonRunning = await isDaemonRunning()

    console.log(`${bold('VaultMesh Status')}`)
    console.log(`  Server:  ${serverStatus === 'connected' ? green('● connected') : red('○ ' + serverStatus)}  ${dim(config.serverUrl)}`)
    console.log(`  Daemon:  ${daemonRunning ? green('● running') : yellow('○ stopped')}`)
    console.log(`  Vault:   ${config.vaultPath}`)
    console.log(`  Tenant:  ${config.tenantId}`)
    console.log(`  User:    ${config.userId}`)
  })

// ── admin commands ──────────────────────────────────────

const admin = program.command('admin').description('Admin commands')

admin
  .command('signup')
  .description('Create a new tenant')
  .requiredOption('--email <email>', 'Admin email')
  .requiredOption('--server <url>', 'Server URL')
  .requiredOption('--tenant-name <name>', 'Tenant name')
  .option('--path <dir>', 'Custom vault path')
  .action(async (opts: { email: string; server: string; tenantName: string; path?: string }) => {
    const serverUrl = validateServerUrl(opts.server)
    const password = await promptPassword('Set admin password: ')
    if (!password || password.length < 8) {
      error('Password must be at least 8 characters')
      process.exit(1)
    }

    try {
      const res = await fetch(`${serverUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: opts.email, password, tenantName: opts.tenantName }),
      })

      if (!res.ok) {
        const body = await res.json() as { message?: string }
        error(body.message || 'Signup failed')
        process.exit(1)
      }

      const data = await res.json() as { tenantId: string; userId: string; accessToken: string; refreshToken: string }
      const slug = opts.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const vaultPath = opts.path || join(homedir(), 'VaultMesh', slug)

      await ensureConfigDir()
      await saveConfig({
        serverUrl: serverUrl,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        userId: data.userId,
        tenantId: data.tenantId,
        tenantName: opts.tenantName,
        vaultPath,
      })

      success(`Tenant "${opts.tenantName}" created.`)
      success(`Tenant ID: ${data.tenantId}`)
      success(`Your vault: ${bold(vaultPath)}`)
      console.log(`${dim('Next: vaultmesh daemon start')}`)
    } catch (err) {
      error(`Signup failed: ${err}`)
      process.exit(1)
    }
  })

admin
  .command('invite')
  .description('Invite a team member')
  .requiredOption('--email <email>', 'Email to invite')
  .option('--role <role>', 'Role: admin or member', 'member')
  .option('--group <id>', 'Group ID to add to')
  .action(async (opts: { email: string; role: string; group?: string }) => {
    const config = await requireConfig()

    const res = await apiRequest(config, '/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: opts.email, role: opts.role, groupId: opts.group }),
    })

    if (!res.ok) {
      const body = await res.json() as { message?: string }
      error(body.message || 'Invite failed')
      process.exit(1)
    }

    const data = await res.json() as { inviteToken: string; expiresAt: string }
    success(`Invite created for ${opts.email} (${opts.role}).`)
    console.log(`  Token: ${bold(data.inviteToken)}`)
    console.log(`  Expires: ${data.expiresAt}`)
    console.log(`  Share: ${dim(`vaultmesh setup --token ${data.inviteToken}`)}`)
  })

// ── admin groups ────────────────────────────────────────

const groups = admin.command('groups').description('Manage groups')

groups
  .command('create <name>')
  .description('Create a group')
  .action(async (name: string) => {
    const config = await requireConfig()
    const res = await apiRequest(config, '/api/admin/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!res.ok) {
      const body = await res.json() as { message?: string }
      error(body.message || 'Failed to create group')
      process.exit(1)
    }

    const data = await res.json() as { id: string }
    success(`Group "${name}" created (${data.id}).`)
  })

groups
  .command('add <groupId> <email>')
  .description('Add a user to a group')
  .action(async (groupId: string, email: string) => {
    const config = await requireConfig()
    const res = await apiRequest(config, `/api/admin/groups/${groupId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const body = await res.json() as { message?: string }
      error(body.message || 'Failed to add member')
      process.exit(1)
    }

    success(`${email} added to group.`)
  })

groups
  .command('remove <groupId> <email>')
  .description('Remove a user from a group')
  .action(async (groupId: string, email: string) => {
    const config = await requireConfig()
    const res = await apiRequest(config, `/api/admin/groups/${groupId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })

    if (!res.ok) {
      const body = await res.json() as { message?: string }
      error(body.message || 'Failed to remove member')
      process.exit(1)
    }

    success(`${email} removed from group.`)
  })

// ── admin permissions ───────────────────────────────────

admin
  .command('permissions')
  .description('List or set folder permissions')
  .argument('[action]', 'set')
  .argument('[folder]', 'Folder path')
  .argument('[groupId]', 'Group ID')
  .argument('[role]', 'viewer, editor, or owner')
  .action(async (action?: string, folder?: string, groupId?: string, role?: string) => {
    const config = await requireConfig()

    if (!action || action === 'list') {
      const res = await apiRequest(config, '/api/permissions')
      if (!res.ok) {
        error('Failed to list permissions')
        process.exit(1)
      }
      const data = await res.json() as { folderPath: string; role: string }[]
      if (data.length === 0) {
        console.log(dim('No permissions found.'))
        return
      }
      console.log(bold('Your permissions:'))
      for (const p of data) {
        console.log(`  ${p.folderPath}  ${dim(p.role)}`)
      }
      return
    }

    if (action === 'set') {
      if (!folder || !groupId || !role) {
        error('Usage: vaultmesh admin permissions set <folder> <groupId> <role>')
        process.exit(1)
      }

      const res = await apiRequest(config, '/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folder, groupId, role }),
      })

      if (!res.ok) {
        const body = await res.json() as { message?: string }
        error(body.message || 'Failed to set permission')
        process.exit(1)
      }

      success(`Permission set: ${folder} → ${role} for group ${groupId}`)
    }
  })

// ── conflicts ───────────────────────────────────────────

const conflicts = program.command('conflicts').description('Manage conflicts')

conflicts
  .command('list')
  .description('List unresolved conflicts')
  .action(async () => {
    const conflictsDir = getConflictsDir()
    try {
      const files = await readdir(conflictsDir)
      const conflictFiles = files.filter(f => f.includes('.CONFLICT-'))

      if (conflictFiles.length === 0) {
        success('No conflicts. All files in sync.')
        return
      }

      console.log(bold(`${conflictFiles.length} conflict(s):`))
      for (let i = 0; i < conflictFiles.length; i++) {
        const f = conflictFiles[i]!
        // Parse: {path}.CONFLICT-{ts}-{user}.{ext}
        const match = f.match(/^(.+)\.CONFLICT-(.+)-([^.]+)(\..+)?$/)
        if (match) {
          const [, path, ts, user] = match
          const displayPath = path!.replace(/__/g, '/')
          console.log(`  ${yellow(`${i + 1}.`)} ${displayPath}  ${dim(`by ${user}, ${ts}`)}`)
        } else {
          console.log(`  ${yellow(`${i + 1}.`)} ${f}`)
        }
      }
      console.log(dim('\nRun: vaultmesh conflicts resolve <file> --keep <ours|theirs>'))
    } catch {
      success('No conflicts. All files in sync.')
    }
  })

conflicts
  .command('resolve <file>')
  .description('Resolve a conflict')
  .requiredOption('--keep <strategy>', 'ours or theirs')
  .action(async (file: string, opts: { keep: string }) => {
    if (opts.keep !== 'ours' && opts.keep !== 'theirs') {
      error('--keep must be "ours" or "theirs"')
      process.exit(1)
    }

    const config = await requireConfig()
    const conflictsDir = getConflictsDir()

    try {
      const files = await readdir(conflictsDir)
      const match = files.find(f => f.includes(file) && f.includes('.CONFLICT-'))

      if (!match) {
        error(`No conflict found matching "${file}"`)
        process.exit(1)
      }

      if (opts.keep === 'ours') {
        // Copy conflict file to vault (overwrite server version)
        const conflictContent = await readFile(join(conflictsDir, match))
        const originalPath = match.replace(/\.CONFLICT-.+$/, '').replace(/__/g, '/')
        const fullPath = join(config.vaultPath, originalPath)
        await writeFile(fullPath, conflictContent)
        success(`Kept your version of ${originalPath}`)
      } else {
        // "theirs" = keep server version (already in vault), just remove conflict file
        success(`Kept server version. Your copy is in ${dim(join(conflictsDir, match))}`)
      }

      // Remove conflict file
      await unlink(join(conflictsDir, match))
    } catch (err) {
      error(`Failed to resolve conflict: ${err}`)
      process.exit(1)
    }
  })

// ── daemon commands ─────────────────────────────────────

const daemonCmd = program.command('daemon').description('Manage the sync daemon')

daemonCmd
  .command('start')
  .description('Start the sync daemon')
  .option('--debug', 'Enable debug logging')
  .action(async (opts: { debug?: boolean }) => {
    const config = await requireConfig()

    if (opts.debug) setLogLevel('debug')

    // Check if already running
    if (await isDaemonRunning()) {
      warn('Daemon is already running.')
      return
    }

    // Write PID file
    await writeFile(getPidPath(), String(process.pid))

    success('Starting sync daemon...')

    // Import and start daemon
    const { VaultDaemon } = await import('./daemon.js')
    const { RealTransport } = await import('./transport.js')

    const transport = new RealTransport(config, async () => {
      // Called only on 401 (token expired), not on every request
      const refreshed = await refreshToken(config)
      if (!refreshed) throw new Error('Token refresh failed')
      return config.accessToken
    })

    const daemon = new VaultDaemon(config, transport)

    // Graceful shutdown
    const shutdown = async () => {
      log('info', 'daemon', 'shutdown-signal')
      await daemon.stop()
      try { await unlink(getPidPath()) } catch {}
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    try {
      await daemon.start()
      success(`Daemon running. Watching ${bold(config.vaultPath)}`)
    } catch (err) {
      error(`Failed to start daemon: ${err}`)
      try { await unlink(getPidPath()) } catch {}
      process.exit(1)
    }
  })

daemonCmd
  .command('stop')
  .description('Stop the sync daemon')
  .action(async () => {
    await stopDaemonProcess()
    success('Daemon stopped.')
  })

daemonCmd
  .command('logs')
  .description('View daemon logs')
  .option('--pretty', 'Pretty-print logs')
  .option('-n, --lines <n>', 'Number of lines', '20')
  .action(async (opts: { pretty?: boolean; lines: string }) => {
    const logPath = getLogPath()
    try {
      const content = await readFile(logPath, 'utf-8')
      const lines = content.trim().split('\n')
      const last = lines.slice(-parseInt(opts.lines, 10))

      for (const line of last) {
        if (opts.pretty) {
          try {
            const entry = JSON.parse(line) as Record<string, unknown>
            const ts = (entry.ts as string || '').slice(11, 19)
            const level = entry.level as string
            const mod = entry.mod as string
            const event = entry.event as string
            const { ts: _, level: __, mod: ___, event: ____, ...rest } = entry
            const details = Object.keys(rest).length > 0 ? dim(JSON.stringify(rest)) : ''
            const levelColor = level === 'error' ? red : level === 'warn' ? yellow : level === 'debug' ? dim : (s: string) => s
            console.log(`${dim(ts)} ${levelColor(level.padEnd(5))} ${bold(mod)} ${event} ${details}`)
          } catch {
            console.log(line)
          }
        } else {
          console.log(line)
        }
      }
    } catch {
      console.log(dim('No logs yet.'))
    }
  })

// ── PID Management ──────────────────────────────────────

async function isDaemonRunning(): Promise<boolean> {
  try {
    const pid = parseInt(await readFile(getPidPath(), 'utf-8'), 10)
    if (isNaN(pid)) return false
    process.kill(pid, 0) // Signal 0 = check if process exists
    return true
  } catch {
    return false
  }
}

async function stopDaemonProcess(): Promise<void> {
  try {
    const pid = parseInt(await readFile(getPidPath(), 'utf-8'), 10)
    if (!isNaN(pid)) {
      process.kill(pid, 'SIGTERM')
      // Wait up to 5s for process to exit
      for (let i = 0; i < 50; i++) {
        try { process.kill(pid, 0); await new Promise(r => setTimeout(r, 100)) } catch { break }
      }
    }
  } catch {
    // No PID file or process not running
  }
  try { await unlink(getPidPath()) } catch {}
}

// ── Password Prompt ─────────────────────────────────────

async function promptPassword(prompt: string): Promise<string> {
  process.stdout.write(prompt)

  return new Promise((resolve) => {
    let password = ''
    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    if (stdin.setRawMode) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf-8')

    const onData = (ch: string) => {
      if (ch === '\n' || ch === '\r') {
        stdin.removeListener('data', onData)
        if (stdin.setRawMode) stdin.setRawMode(wasRaw ?? false)
        stdin.pause()
        process.stdout.write('\n')
        resolve(password)
      } else if (ch === '\u0003') {
        // Ctrl+C
        process.exit(0)
      } else if (ch === '\u007F' || ch === '\b') {
        // Backspace
        password = password.slice(0, -1)
      } else {
        password += ch
      }
    }

    stdin.on('data', onData)
  })
}

export { program }
