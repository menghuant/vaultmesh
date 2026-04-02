import { execFile } from 'node:child_process'
import { log } from '@vaultmesh/shared'

/** Send a macOS desktop notification using osascript */
export function notify(title: string, body: string): void {
  if (process.platform !== 'darwin') {
    log('debug', 'daemon', 'notification-skipped', { reason: 'not-macos', title, body })
    return
  }

  // Use execFile to avoid shell interpretation (prevents command injection via filenames)
  const script = `display notification "${body.replace(/["\\]/g, '')}" with title "${title.replace(/["\\]/g, '')}"`
  execFile('osascript', ['-e', script], (err) => {
    if (err) {
      log('debug', 'daemon', 'notification-failed', { error: err.message })
    }
  })
}

export function notifyFileSync(path: string, updatedBy: string): void {
  const filename = path.split('/').pop() || path
  notify('VaultMesh', `${filename} updated by ${updatedBy}`)
}

export function notifyConflict(path: string, otherUser: string): void {
  const filename = path.split('/').pop() || path
  notify(
    'VaultMesh — Conflict',
    `${filename} conflicts with ${otherUser}'s version. Run: vaultmesh conflicts`,
  )
}

export function notifyPermissionRevoked(paths: string[]): void {
  const summary = paths.length === 1
    ? `${paths[0]} removed (permission change)`
    : `${paths.length} paths removed (permission change)`
  notify('VaultMesh — Access Changed', summary)
}

export function notifyReconnected(filesSynced: number): void {
  notify('VaultMesh', `Back online. ${filesSynced} files synced.`)
}

export function notifySetupComplete(vaultPath: string, fileCount: number): void {
  notify('VaultMesh', `${fileCount} files synced to ${vaultPath}`)
}
