import { readFile, writeFile, mkdir, unlink, readdir, stat, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const CONFIG_DIR = join(homedir(), '.vaultmesh')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export interface DaemonConfig {
  serverUrl: string
  accessToken: string
  refreshToken: string
  userId: string
  tenantId: string
  tenantName: string
  vaultPath: string
}

export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true })
  await mkdir(join(CONFIG_DIR, 'logs'), { recursive: true })
  await mkdir(join(CONFIG_DIR, 'conflicts'), { recursive: true })
}

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export function getPidPath(): string {
  return join(CONFIG_DIR, 'daemon.pid')
}

export function getStatePath(): string {
  return join(CONFIG_DIR, 'state.json')
}

export function getLogPath(): string {
  return join(CONFIG_DIR, 'logs', 'daemon.jsonl')
}

export function getConflictsDir(): string {
  return join(CONFIG_DIR, 'conflicts')
}

export async function loadConfig(): Promise<DaemonConfig | null> {
  try {
    const raw = await readFile(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as DaemonConfig
  } catch {
    return null
  }
}

export async function saveConfig(config: DaemonConfig): Promise<void> {
  await ensureConfigDir()
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 })
}

export async function deleteConfig(): Promise<void> {
  try { await unlink(CONFIG_FILE) } catch {}
}

// ── Sync State ──────────────────────────────────────────

export interface SyncState {
  lastSyncAt: string | null
  lastCursor: string | null
}

export async function loadSyncState(): Promise<SyncState> {
  try {
    const raw = await readFile(getStatePath(), 'utf-8')
    return JSON.parse(raw) as SyncState
  } catch {
    return { lastSyncAt: null, lastCursor: null }
  }
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await writeFile(getStatePath(), JSON.stringify(state), { mode: 0o600 })
}

// ── Log Rotation ───────────────────────────────────────

const LOG_RETENTION_DAYS = 7
const MAX_LOG_SIZE_BYTES = 10 * 1024 * 1024 // 10MB per file

/** Rotate log file if it exceeds size limit. Delete logs older than retention. */
export async function rotateLogsIfNeeded(): Promise<void> {
  const logDir = join(CONFIG_DIR, 'logs')
  const currentLog = getLogPath()

  try {
    const logStat = await stat(currentLog)
    if (logStat.size >= MAX_LOG_SIZE_BYTES) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const rotatedPath = join(logDir, `daemon-${ts}.jsonl`)
      await rename(currentLog, rotatedPath)
    }
  } catch {
    // Log file doesn't exist yet
  }

  // Clean up old log files
  try {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const files = await readdir(logDir)
    for (const file of files) {
      if (file === 'daemon.jsonl') continue // Skip current log
      const filePath = join(logDir, file)
      try {
        const fileStat = await stat(filePath)
        if (fileStat.mtimeMs < cutoff) {
          await unlink(filePath)
        }
      } catch {}
    }
  } catch {}
}
