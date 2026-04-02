import { watch, type FSWatcher } from 'chokidar'
import { readFile, writeFile, unlink, stat, mkdir } from 'node:fs/promises'
import { join, dirname, resolve } from 'node:path'
import { sha256, log, MAX_FILE_SIZE, type ManifestEntry } from '@vaultmesh/shared'
import type { RealTransport } from './transport.js'
import type { DaemonConfig } from './config.js'
import { loadIgnoreFilter, getRelativePath, type IgnoreFilter } from './ignore.js'
import { saveSyncState } from './config.js'
import { notifyFileSync, notifyConflict, notifyPermissionRevoked } from './notifications.js'

export class VaultDaemon {
  private watcher: FSWatcher | null = null
  private ignoreFilter: IgnoreFilter | null = null
  private pendingWrites = new Set<string>() // Paths we just wrote, suppress upload
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private knownHashes = new Map<string, string>() // path -> last known server hash
  private shuttingDown = false
  private pendingUploads = 0
  private readonly DEBOUNCE_MS = 300
  private readonly STABILITY_WAIT_MS = 100
  private readonly MAX_PARALLEL_DOWNLOADS = 10

  constructor(
    private config: DaemonConfig,
    private transport: RealTransport,
  ) {}

  /** Resolve a relative path safely within the vault. Throws on traversal. */
  private safePath(relPath: string): string {
    const fullPath = resolve(this.config.vaultPath, relPath)
    const vaultRoot = resolve(this.config.vaultPath)
    if (!fullPath.startsWith(vaultRoot + '/') && fullPath !== vaultRoot) {
      throw new Error(`Path traversal blocked: ${relPath}`)
    }
    return fullPath
  }

  async start(): Promise<void> {
    log('info', 'daemon', 'starting', { vaultPath: this.config.vaultPath })

    // Ensure vault directory exists
    await mkdir(this.config.vaultPath, { recursive: true })

    // Load ignore patterns
    this.ignoreFilter = await loadIgnoreFilter(this.config.vaultPath)

    // Register event handlers
    this.transport.onRemoteChange(async (change) => {
      log('info', 'daemon', 'remote-change', { path: change.path, updatedBy: change.updatedBy })
      try {
        await this.handleRemoteChange(change.path)
        notifyFileSync(change.path, change.updatedBy)
      } catch (err) {
        log('error', 'daemon', 'remote-change-failed', { path: change.path, error: String(err) })
      }
    })

    this.transport.onConflict((conflict) => {
      log('warn', 'daemon', 'conflict', { path: conflict.path })
      this.handleConflict(conflict.path, conflict.serverHash, conflict.yourHash)
      notifyConflict(conflict.path, 'another user')
    })

    this.transport.onPermissionRevoked((paths) => {
      log('info', 'daemon', 'permission-revoked', { paths })
      notifyPermissionRevoked(paths)
    })

    this.transport.onRemoteDelete(async (path, deletedBy) => {
      log('info', 'daemon', 'remote-delete', { path, deletedBy })
      try {
        // Server deleted this file. Check hash before local delete.
        const knownHash = this.knownHashes.get(path) || ''
        await this.handleServerDelete(path, knownHash)
      } catch (err) {
        log('error', 'daemon', 'remote-delete-failed', { path, error: String(err) })
      }
    })

    this.transport.onRemoteRename(async (oldPath, newPath) => {
      log('info', 'daemon', 'remote-rename', { oldPath, newPath })
      try {
        // Download the file at the new path, delete old
        await this.handleRemoteChange(newPath)
        const oldFull = this.safePath(oldPath)
        this.pendingWrites.add(oldPath)
        await unlink(oldFull).catch(() => {})
        this.knownHashes.delete(oldPath)
        setTimeout(() => this.pendingWrites.delete(oldPath), 500)
      } catch (err) {
        log('error', 'daemon', 'remote-rename-failed', { oldPath, newPath, error: String(err) })
      }
    })

    this.transport.onPermissionGranted(async (paths) => {
      log('info', 'daemon', 'permission-granted', { paths })
      // Trigger a partial sync for newly accessible folders
      try { await this.startupSync() } catch {}
    })

    // Connect WebSocket
    try {
      await this.transport.connect()
    } catch (err) {
      log('warn', 'daemon', 'initial-ws-connect-failed', { error: String(err) })
      // Will reconnect automatically
    }

    // Run startup sync
    await this.startupSync()

    // Start file watcher
    this.startWatcher()

    log('info', 'daemon', 'started', { vaultPath: this.config.vaultPath })
  }

  // ── Startup Sync ──────────────────────────────────────

  async startupSync(): Promise<void> {
    log('info', 'daemon', 'startup-sync-begin')

    // Build local manifest
    const manifest = await this.buildManifest()
    log('info', 'daemon', 'manifest-built', { fileCount: manifest.length })

    // Record local file hashes as known state
    for (const entry of manifest) {
      this.knownHashes.set(entry.path, entry.hash)
    }

    // Send to server, get sync plan
    const plan = await this.transport.sendManifest(manifest)
    log('info', 'daemon', 'sync-plan-received', {
      download: plan.download.length,
      upload: plan.upload.length,
      conflict: plan.conflict.length,
      delete: plan.delete.length,
    })

    // Process downloads (parallel, limited concurrency)
    // Note: knownHashes for downloads are set inside downloadWorker on success,
    // not here, to avoid poisoning state on failed downloads
    if (plan.download.length > 0) {
      await this.processDownloads(plan.download)
    }

    // Process uploads
    for (const item of plan.upload) {
      if (this.shuttingDown) break
      try {
        await this.uploadLocalFile(item.path)
      } catch (err) {
        log('error', 'daemon', 'startup-upload-failed', { path: item.path, error: String(err) })
      }
    }

    // Process conflicts
    for (const item of plan.conflict) {
      await this.handleConflict(item.path, item.serverHash, item.localHash)
    }

    // Process deletes (server deleted, client still has)
    for (const item of plan.delete) {
      try {
        await this.handleServerDelete(item.path, item.lastKnownHash)
      } catch (err) {
        log('error', 'daemon', 'startup-delete-failed', { path: item.path, error: String(err) })
      }
    }

    await saveSyncState({ lastSyncAt: new Date().toISOString(), lastCursor: null })
    log('info', 'daemon', 'startup-sync-complete')
  }

  private async processDownloads(items: { path: string; hash: string; sizeBytes: number }[]): Promise<void> {
    // Parallel downloads with limited concurrency
    const queue = [...items]
    const workers: Promise<void>[] = []

    for (let i = 0; i < Math.min(this.MAX_PARALLEL_DOWNLOADS, queue.length); i++) {
      workers.push(this.downloadWorker(queue))
    }

    await Promise.all(workers)
  }

  private async downloadWorker(queue: { path: string; hash: string; sizeBytes: number }[]): Promise<void> {
    while (queue.length > 0 && !this.shuttingDown) {
      const item = queue.shift()
      if (!item) break

      try {
        const content = await this.transport.downloadFile(item.path)
        const fullPath = this.safePath(item.path)
        await mkdir(dirname(fullPath), { recursive: true })

        // Mark as pending write to suppress watcher upload
        this.pendingWrites.add(item.path)
        await writeFile(fullPath, content)
        // Record hash only after successful write
        this.knownHashes.set(item.path, sha256(content))
        // Remove after a short delay to ensure watcher event is caught
        setTimeout(() => this.pendingWrites.delete(item.path), 500)

        log('debug', 'daemon', 'file-downloaded', { path: item.path, sizeBytes: content.length })
      } catch (err) {
        log('error', 'daemon', 'download-failed', { path: item.path, error: String(err) })
      }
    }
  }

  // ── File Watcher ──────────────────────────────────────

  private startWatcher(): void {
    this.watcher = watch(this.config.vaultPath, {
      ignored: (path: string) => {
        if (!this.ignoreFilter) return false
        const rel = getRelativePath(this.config.vaultPath, path)
        if (!rel || rel === '.') return false
        return this.ignoreFilter.isIgnored(rel)
      },
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: this.STABILITY_WAIT_MS,
        pollInterval: 50,
      },
    })

    this.watcher.on('add', (path) => this.debouncedChange(path))
    this.watcher.on('change', (path) => this.debouncedChange(path))
    this.watcher.on('unlink', (path) => this.handleLocalDelete(path))

    this.watcher.on('error', (err) => {
      log('error', 'daemon', 'watcher-error', { error: String(err) })
    })

    log('info', 'daemon', 'watcher-started', { path: this.config.vaultPath })
  }

  private debouncedChange(fullPath: string): void {
    const relPath = getRelativePath(this.config.vaultPath, fullPath)
    if (!relPath) return

    // Write-back loop suppression
    if (this.pendingWrites.has(relPath)) {
      log('debug', 'daemon', 'write-back-suppressed', { path: relPath })
      return
    }

    // Clear existing debounce timer
    const existing = this.debounceTimers.get(relPath)
    if (existing) clearTimeout(existing)

    // Set new debounce timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(relPath)
      this.handleLocalChange(relPath, fullPath)
    }, this.DEBOUNCE_MS)

    this.debounceTimers.set(relPath, timer)
  }

  private async handleLocalChange(relPath: string, fullPath: string): Promise<void> {
    if (this.shuttingDown) return

    try {
      // Check file size stability (read twice)
      const stat1 = await stat(fullPath)
      await new Promise(r => setTimeout(r, this.STABILITY_WAIT_MS))
      const stat2 = await stat(fullPath)

      if (stat1.size !== stat2.size) {
        log('debug', 'daemon', 'file-unstable', { path: relPath, size1: stat1.size, size2: stat2.size })
        // Re-queue
        this.debouncedChange(fullPath)
        return
      }

      // 50MB client-side check
      if (stat2.size > MAX_FILE_SIZE) {
        log('warn', 'daemon', 'file-too-large', { path: relPath, sizeBytes: stat2.size, maxBytes: MAX_FILE_SIZE })
        return
      }

      await this.uploadLocalFile(relPath)
    } catch (err: any) {
      if (err.code === 'ENOENT') return // File was deleted between events
      log('error', 'daemon', 'local-change-failed', { path: relPath, error: String(err) })
    }
  }

  private async uploadLocalFile(relPath: string): Promise<void> {
    const fullPath = this.safePath(relPath)
    const content = await readFile(fullPath)
    const hash = sha256(content)
    // Use the last known server hash as baseHash (empty for new files)
    const baseHash = this.knownHashes.get(relPath) || ''

    this.pendingUploads++
    try {
      const result = await this.transport.uploadFile(relPath, content, baseHash)
      if (!result.accepted) {
        log('warn', 'daemon', 'upload-conflict', { path: relPath, conflict: result.conflict })
        if (result.conflict) {
          await this.handleConflict(relPath, result.conflict.serverHash, result.conflict.clientHash)
        }
      } else {
        log('debug', 'daemon', 'file-uploaded', { path: relPath, version: result.version })
        // Update known hash after successful upload
        this.knownHashes.set(relPath, hash)
        // Notify other daemons via WS
        this.transport.notifyFileChanged(relPath, hash, content.length)
      }
    } finally {
      this.pendingUploads--
    }
  }

  private async handleLocalDelete(fullPath: string): Promise<void> {
    const relPath = getRelativePath(this.config.vaultPath, fullPath)
    if (!relPath) return

    // Clear any pending debounce timer for this path
    const timer = this.debounceTimers.get(relPath)
    if (timer) { clearTimeout(timer); this.debounceTimers.delete(relPath) }

    // Write-back loop suppression
    if (this.pendingWrites.has(relPath)) {
      this.pendingWrites.delete(relPath)
      return
    }

    if (this.shuttingDown) return

    try {
      await this.transport.deleteFile(relPath)
      this.transport.notifyFileDeleted(relPath)
      this.knownHashes.delete(relPath)
      log('info', 'daemon', 'file-deleted-remote', { path: relPath })
    } catch (err) {
      log('error', 'daemon', 'remote-delete-failed', { path: relPath, error: String(err) })
    }
  }

  // ── Remote Event Handlers ─────────────────────────────

  private async handleRemoteChange(path: string): Promise<void> {
    const content = await this.transport.downloadFile(path)
    const fullPath = this.safePath(path)
    await mkdir(dirname(fullPath), { recursive: true })

    this.pendingWrites.add(path)
    await writeFile(fullPath, content)
    // Update known hash to the downloaded version
    this.knownHashes.set(path, sha256(content))
    setTimeout(() => this.pendingWrites.delete(path), 500)
  }

  private async handleConflict(path: string, serverHash: string, localHash: string): Promise<void> {
    const { getConflictsDir } = await import('./config.js')
    const conflictsDir = getConflictsDir()
    await mkdir(conflictsDir, { recursive: true })

    // Save local version as conflict copy
    const fullPath = this.safePath(path)
    try {
      const localContent = await readFile(fullPath)
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const ext = path.includes('.') ? '.' + path.split('.').pop() : ''
      const baseName = path.replace(/\//g, '__')
      const conflictName = `${baseName}.CONFLICT-${ts}-${this.config.userId}${ext}`
      await writeFile(join(conflictsDir, conflictName), localContent)
      log('info', 'daemon', 'conflict-saved', { path, conflictFile: conflictName })
    } catch (err) {
      log('error', 'daemon', 'conflict-save-failed', { path, error: String(err) })
    }

    // Download server version as canonical
    try {
      const serverContent = await this.transport.downloadFile(path)
      this.pendingWrites.add(path)
      await writeFile(fullPath, serverContent)
      // Update known hash to server version to prevent re-conflict on next edit
      this.knownHashes.set(path, sha256(serverContent))
      setTimeout(() => this.pendingWrites.delete(path), 500)
    } catch (err) {
      log('error', 'daemon', 'conflict-download-failed', { path, error: String(err) })
    }
  }

  private async handleServerDelete(path: string, lastKnownHash: string): Promise<void> {
    const fullPath = this.safePath(path)

    try {
      // Check if local file matches the server's last known hash
      const content = await readFile(fullPath)
      const localHash = sha256(content)

      if (localHash === lastKnownHash) {
        // Same content, safe to delete locally
        this.pendingWrites.add(path)
        await unlink(fullPath)
        this.knownHashes.delete(path)
        setTimeout(() => this.pendingWrites.delete(path), 500)
        log('info', 'daemon', 'file-deleted-local', { path })
      } else {
        // Local file was modified after server delete, treat as conflict
        log('warn', 'daemon', 'delete-conflict', { path, localHash, serverHash: lastKnownHash })
        // Keep local file, will be re-uploaded on next manifest sync
      }
    } catch (err: any) {
      if (err.code === 'ENOENT') return // Already deleted
      log('error', 'daemon', 'server-delete-handling-failed', { path, error: String(err) })
    }
  }

  // ── Manifest ──────────────────────────────────────────

  async buildManifest(): Promise<ManifestEntry[]> {
    const { readdir, stat: fsStat } = await import('node:fs/promises')
    const entries: ManifestEntry[] = []

    const walk = async (dir: string): Promise<void> => {
      const items = await readdir(dir, { withFileTypes: true })
      for (const item of items) {
        const fullPath = join(dir, item.name)
        const relPath = getRelativePath(this.config.vaultPath, fullPath)

        if (this.ignoreFilter?.isIgnored(relPath, item.isDirectory())) continue

        if (item.isDirectory()) {
          await walk(fullPath)
        } else if (item.isFile()) {
          try {
            const content = await readFile(fullPath)
            const s = await fsStat(fullPath)
            entries.push({
              path: relPath,
              hash: sha256(content),
              sizeBytes: s.size,
            })
          } catch {
            // Skip files we can't read
          }
        }
      }
    }

    await walk(this.config.vaultPath)
    return entries
  }

  // ── Lifecycle ─────────────────────────────────────────

  async stop(): Promise<void> {
    log('info', 'daemon', 'stopping')
    this.shuttingDown = true

    // Wait for pending uploads (max 5s)
    const deadline = Date.now() + 5000
    while (this.pendingUploads > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100))
    }

    // Clear debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()

    // Stop watcher
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }

    // Disconnect WS
    this.transport.disconnect()

    // Save state
    await saveSyncState({ lastSyncAt: new Date().toISOString(), lastCursor: null })

    log('info', 'daemon', 'stopped')
  }
}
