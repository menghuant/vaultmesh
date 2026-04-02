import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
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
