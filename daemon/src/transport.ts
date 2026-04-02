import {
  sha256,
  log,
  type SyncTransport, type ManifestEntry, type SyncPlan,
  type UploadResult, type RemoteChange, type ConflictEvent,
  type ServerMessage,
} from '@vaultmesh/shared'
import type { DaemonConfig } from './config.js'

type RemoteChangeCb = (change: RemoteChange) => void
type ConflictCb = (conflict: ConflictEvent) => void
type PermissionRevokedCb = (paths: string[]) => void
type PermissionGrantedCb = (paths: string[]) => void
type RemoteDeleteCb = (path: string, deletedBy: string) => void
type RemoteRenameCb = (oldPath: string, newPath: string) => void

export class RealTransport implements SyncTransport {
  private ws: WebSocket | null = null
  private remoteChangeCallbacks: RemoteChangeCb[] = []
  private conflictCallbacks: ConflictCb[] = []
  private permRevokedCallbacks: PermissionRevokedCb[] = []
  private permGrantedCallbacks: PermissionGrantedCb[] = []
  private remoteDeleteCallbacks: RemoteDeleteCb[] = []
  private remoteRenameCallbacks: RemoteRenameCb[] = []
  private reconnectDelay = 1000
  private maxReconnectDelay = 30_000
  private shuttingDown = false
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private refreshToken: () => Promise<string>
  private cachedToken: string
  private refreshPromise: Promise<string> | null = null // Mutex for token refresh

  constructor(
    private config: DaemonConfig,
    tokenRefresher: () => Promise<string>,
  ) {
    this.refreshToken = tokenRefresher
    this.cachedToken = config.accessToken
  }

  // ── HTTP Methods ────────────────────────────────────────

  /** Get current access token. Only refresh on 401, not on every call. */
  private async getToken(): Promise<string> {
    return this.cachedToken
  }

  /** Refresh the token with mutex to prevent concurrent refresh races. */
  private async doRefresh(): Promise<string> {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.refreshToken().finally(() => { this.refreshPromise = null })
    this.cachedToken = await this.refreshPromise
    return this.cachedToken
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      'Authorization': `Bearer ${this.cachedToken}`,
    }
  }

  /** Fetch with automatic 401 retry after token refresh */
  private async fetchWithAuth(url: string, init: RequestInit = {}): Promise<Response> {
    const headers = { ...await this.authHeaders(), ...((init.headers as Record<string, string>) || {}) }
    let res = await fetch(url, { ...init, headers })

    if (res.status === 401) {
      await this.doRefresh()
      const retryHeaders = { ...await this.authHeaders(), ...((init.headers as Record<string, string>) || {}) }
      res = await fetch(url, { ...init, headers: retryHeaders })
    }

    return res
  }

  async uploadFile(path: string, content: Buffer, baseHash: string): Promise<UploadResult> {
    const url = `${this.config.serverUrl}/api/files/${encodeURIComponent(path)}`

    const res = await this.fetchWithAuth(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Base-Hash': baseHash,
      },
      body: content,
    })

    if (!res.ok && res.status !== 409) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`Upload failed (${res.status}): ${(body as any).message || res.statusText}`)
    }

    return await res.json() as UploadResult
  }

  async downloadFile(path: string): Promise<Buffer> {
    const url = `${this.config.serverUrl}/api/files/${encodeURIComponent(path)}`

    const res = await this.fetchWithAuth(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`Download failed (${res.status}): ${(body as any).message || res.statusText}`)
    }

    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  }

  async deleteFile(path: string): Promise<void> {
    const url = `${this.config.serverUrl}/api/files/${encodeURIComponent(path)}`

    const res = await this.fetchWithAuth(url, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`Delete failed (${res.status}): ${(body as any).message || res.statusText}`)
    }
  }

  async sendManifest(manifest: ManifestEntry[]): Promise<SyncPlan> {
    const url = `${this.config.serverUrl}/api/sync/manifest`

    const res = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: manifest }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(`Manifest sync failed (${res.status}): ${(body as any).message || res.statusText}`)
    }

    return await res.json() as SyncPlan
  }

  // ── WebSocket Methods ──────────────────────────────────

  async connect(): Promise<void> {
    if (this.shuttingDown) return

    const wsUrl = this.config.serverUrl.replace(/^http/, 'ws')
    const ws = new WebSocket(wsUrl)

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error('WebSocket connection timeout'))
      }, 10_000)

      ws.addEventListener('open', async () => {
        clearTimeout(timeout)
        this.ws = ws
        this.reconnectDelay = 1000 // Reset on successful connect

        // First message: auth
        try {
          ws.send(JSON.stringify({ type: 'auth', token: this.cachedToken }))
        } catch (err) {
          ws.close()
          reject(err)
          return
        }
      })

      ws.addEventListener('message', (event) => {
        this.handleServerMessage(event.data as string, resolve)
      })

      ws.addEventListener('close', () => {
        clearTimeout(timeout)
        this.ws = null
        this.stopPing()

        // Reject the connect promise if auth hasn't resolved yet
        reject(new Error('WebSocket closed before authentication'))

        if (!this.shuttingDown) {
          log('info', 'daemon', 'ws-disconnected', { reconnectIn: this.reconnectDelay })
          setTimeout(() => this.reconnect(), this.reconnectDelay)
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay)
        }
      })

      ws.addEventListener('error', (err) => {
        clearTimeout(timeout)
        log('error', 'daemon', 'ws-error', { error: String(err) })
      })
    })
  }

  private handleServerMessage(raw: string, onAuthOk?: (value: void) => void): void {
    let msg: ServerMessage
    try {
      msg = JSON.parse(raw) as ServerMessage
    } catch {
      log('warn', 'daemon', 'invalid-ws-message', { raw })
      return
    }

    switch (msg.type) {
      case 'auth-ok':
        log('info', 'daemon', 'ws-authenticated', { userId: msg.userId })
        this.startPing()
        if (onAuthOk) onAuthOk()
        break

      case 'auth-failed':
        log('error', 'daemon', 'ws-auth-failed', { reason: msg.reason })
        break

      case 'remote-change':
        for (const cb of this.remoteChangeCallbacks) {
          cb({ path: msg.path, hash: msg.hash, updatedBy: msg.updatedBy, updatedAt: msg.updatedAt })
        }
        break

      case 'conflict':
        for (const cb of this.conflictCallbacks) {
          cb({ path: msg.path, serverHash: msg.serverHash, yourHash: msg.yourHash })
        }
        break

      case 'permission-revoked':
        for (const cb of this.permRevokedCallbacks) {
          cb(msg.paths)
        }
        break

      case 'permission-granted':
        for (const cb of this.permGrantedCallbacks) {
          cb(msg.paths)
        }
        break

      case 'pong':
        // Heartbeat response, no action needed
        break

      case 'remote-delete':
        for (const cb of this.remoteDeleteCallbacks) {
          cb(msg.path, msg.deletedBy)
        }
        break

      case 'remote-rename':
        for (const cb of this.remoteRenameCallbacks) {
          cb(msg.oldPath, msg.newPath)
        }
        break
    }
  }

  private async reconnect(): Promise<void> {
    if (this.shuttingDown) return
    try {
      await this.connect()
    } catch (err) {
      log('warn', 'daemon', 'reconnect-failed', { error: String(err) })
    }
  }

  private startPing(): void {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 25_000)
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  /** Notify server of a local file change (events only, no content) */
  notifyFileChanged(path: string, hash: string, sizeBytes: number): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'file-changed', path, hash, sizeBytes }))
    }
  }

  /** Notify server of a local file deletion */
  notifyFileDeleted(path: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'file-deleted', path }))
    }
  }

  // ── Event Callbacks ────────────────────────────────────

  onRemoteChange(cb: RemoteChangeCb): void {
    this.remoteChangeCallbacks.push(cb)
  }

  onConflict(cb: ConflictCb): void {
    this.conflictCallbacks.push(cb)
  }

  onPermissionRevoked(cb: PermissionRevokedCb): void {
    this.permRevokedCallbacks.push(cb)
  }

  onPermissionGranted(cb: PermissionGrantedCb): void {
    this.permGrantedCallbacks.push(cb)
  }

  onRemoteDelete(cb: RemoteDeleteCb): void {
    this.remoteDeleteCallbacks.push(cb)
  }

  onRemoteRename(cb: RemoteRenameCb): void {
    this.remoteRenameCallbacks.push(cb)
  }

  // ── Lifecycle ──────────────────────────────────────────

  disconnect(): void {
    this.shuttingDown = true
    this.stopPing()
    if (this.ws) {
      try { this.ws.close(1000, 'daemon shutdown') } catch {}
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
