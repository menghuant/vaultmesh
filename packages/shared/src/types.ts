// ── Sync Transport Interface ─────────────────────────────
export interface UploadResult {
  accepted: boolean
  conflict?: { serverHash: string; clientHash: string }
  version: number
}

export interface ManifestEntry {
  path: string
  hash: string
  sizeBytes: number
}

export interface SyncPlan {
  download: { path: string; hash: string; sizeBytes: number }[]
  upload: { path: string }[]
  conflict: { path: string; serverHash: string; localHash: string }[]
  delete: { path: string; lastKnownHash: string }[]
}

export interface RemoteChange {
  path: string
  hash: string
  updatedBy: string
  updatedAt: string
}

export interface ConflictEvent {
  path: string
  serverHash: string
  yourHash: string
}

export interface SyncTransport {
  uploadFile(path: string, content: Buffer, baseHash: string): Promise<UploadResult>
  downloadFile(path: string): Promise<Buffer>
  deleteFile(path: string): Promise<void>
  sendManifest(manifest: ManifestEntry[]): Promise<SyncPlan>
  onRemoteChange(cb: (change: RemoteChange) => void): void
  onConflict(cb: (conflict: ConflictEvent) => void): void
  onPermissionRevoked(cb: (paths: string[]) => void): void
  onPermissionGranted(cb: (paths: string[]) => void): void
}

// ── WebSocket Message Types ──────────────────────────────

// Client → Server
export type ClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'file-changed'; path: string; hash: string; sizeBytes: number }
  | { type: 'file-deleted'; path: string }
  | { type: 'file-renamed'; oldPath: string; newPath: string; hash: string }
  | { type: 'ping' }

// Server → Client
export type ServerMessage =
  | { type: 'auth-ok'; userId: string }
  | { type: 'auth-failed'; reason: string }
  | { type: 'remote-change'; path: string; hash: string; updatedBy: string; updatedAt: string }
  | { type: 'remote-delete'; path: string; deletedBy: string }
  | { type: 'remote-rename'; oldPath: string; newPath: string }
  | { type: 'conflict'; path: string; serverHash: string; yourHash: string }
  | { type: 'permission-revoked'; paths: string[] }
  | { type: 'permission-granted'; paths: string[] }
  | { type: 'pong' }

// ── HTTP Request/Response Types ──────────────────────────

export interface SignupRequest {
  email: string
  password: string
  tenantName: string
}

export interface SignupResponse {
  tenantId: string
  userId: string
  accessToken: string
  refreshToken: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  userId: string
  tenantId: string
}

export interface InviteRequest {
  email: string
  role: 'admin' | 'member'
  groupId?: string
}

export interface InviteResponse {
  inviteToken: string
  expiresAt: string
}

export interface RedeemRequest {
  token: string
  password: string
  displayName?: string
}

export interface RedeemResponse {
  accessToken: string
  refreshToken: string
  userId: string
  tenantId: string
}

export interface RefreshRequest {
  refreshToken: string
}

export interface RefreshResponse {
  accessToken: string
  refreshToken: string
}

export interface ManifestRequest {
  files: ManifestEntry[]
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  db: 'connected' | 'disconnected'
  uptime: number
}

export interface PermissionEntry {
  folderPath: string
  groupName: string
  role: 'viewer' | 'editor' | 'owner'
}

export interface ConflictStats {
  totalThisWeek: number
  byFile: { path: string; count: number }[]
}

// ── JWT Payload ──────────────────────────────────────────
export interface JWTPayload {
  sub: string       // userId
  tenant_id: string // tenantId
  role: 'admin' | 'member'
  iat: number
  exp: number
}

// ── Permission Resolution ────────────────────────────────
export type PermissionRole = 'viewer' | 'editor' | 'owner' | 'none'

export interface ResolvedPermission {
  path: string
  role: PermissionRole
  via: string // group name that granted the permission
}
