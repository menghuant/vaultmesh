import { eq, and, ne } from 'drizzle-orm'
import {
  fileMetadata, fileVersions, conflictLog,
  generateId, sha256, normalizePath, pathsCollide,
  AppError, ErrorCode,
  MAX_FILE_SIZE, MAX_FILE_VERSIONS,
  type ManifestEntry, type SyncPlan, type UploadResult,
  log,
} from '@vaultmesh/shared'
import type { Database } from './db.js'
import { storeFile, readStoredFile, deleteStoredFile } from './storage.js'
import { resolvePermission, canRead, canWrite } from './permissions.js'

// ── Manifest Sync ────────────────────────────────────────

export async function processManifest(
  db: Database,
  tenantId: string,
  userId: string,
  clientFiles: ManifestEntry[],
): Promise<SyncPlan> {
  // Get all server files for this tenant
  const serverFiles = await db.select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.tenantId, tenantId), eq(fileMetadata.isDeleted, false)))

  // Build server file map
  const serverMap = new Map(serverFiles.map(f => [f.filePath, f]))

  const plan: SyncPlan = {
    download: [],
    upload: [],
    conflict: [],
    delete: [],
  }

  const clientPaths = new Set(clientFiles.map(f => normalizePath(f.path)))

  // Check each client file
  for (const clientFile of clientFiles) {
    const path = normalizePath(clientFile.path)

    // Check permission
    const perm = await resolvePermission(db, tenantId, userId, path)
    if (!canRead(perm.role)) continue // skip files user can't access

    const serverFile = serverMap.get(path)

    if (!serverFile) {
      // New file on client, server doesn't have it
      if (canWrite(perm.role)) {
        plan.upload.push({ path })
      }
    } else if (serverFile.contentHash !== clientFile.hash) {
      // Both exist but hashes differ
      plan.conflict.push({
        path,
        serverHash: serverFile.contentHash,
        localHash: clientFile.hash,
      })
    }
    // else: hashes match, nothing to do
  }

  // Check server files not on client
  for (const serverFile of serverFiles) {
    const perm = await resolvePermission(db, tenantId, userId, serverFile.filePath)
    if (!canRead(perm.role)) continue

    if (!clientPaths.has(serverFile.filePath)) {
      // Server has it, client doesn't → download
      plan.download.push({
        path: serverFile.filePath,
        hash: serverFile.contentHash,
        sizeBytes: Number(serverFile.sizeBytes),
      })
    }
  }

  // Check for soft-deleted files that client still has
  const deletedFiles = await db.select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.tenantId, tenantId), eq(fileMetadata.isDeleted, true)))

  for (const deleted of deletedFiles) {
    if (clientPaths.has(deleted.filePath)) {
      plan.delete.push({
        path: deleted.filePath,
        lastKnownHash: deleted.contentHash,
      })
    }
  }

  log('info', 'sync', 'manifest-processed', {
    tenantId,
    userId,
    download: plan.download.length,
    upload: plan.upload.length,
    conflict: plan.conflict.length,
    delete: plan.delete.length,
  })

  return plan
}

// ── File Upload ──────────────────────────────────────────

export async function uploadFile(
  db: Database,
  tenantId: string,
  userId: string,
  filePath: string,
  content: Buffer,
  baseHash: string,
): Promise<UploadResult> {
  const normalizedPath = normalizePath(filePath)

  if (content.length > MAX_FILE_SIZE) {
    throw AppError.prototype.constructor === AppError
      ? new AppError(ErrorCode.FILE_TOO_LARGE, `File exceeds ${MAX_FILE_SIZE} bytes`, 413)
      : new AppError(ErrorCode.FILE_TOO_LARGE, `File exceeds ${MAX_FILE_SIZE} bytes`, 413)
  }

  // Check permission
  const perm = await resolvePermission(db, tenantId, userId, normalizedPath)
  if (!canWrite(perm.role)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `No write permission for ${normalizedPath}`, 403)
  }

  // Check case-insensitive collision
  const existingFiles = await db.select({ filePath: fileMetadata.filePath })
    .from(fileMetadata)
    .where(and(eq(fileMetadata.tenantId, tenantId), eq(fileMetadata.isDeleted, false)))

  for (const existing of existingFiles) {
    if (pathsCollide(normalizedPath, existing.filePath)) {
      throw new AppError(
        ErrorCode.PATH_COLLISION,
        `Case-insensitive collision with existing file: ${existing.filePath}`,
        409,
      )
    }
  }

  // Check for conflict (LWW with conflict detection)
  const [serverFile] = await db.select()
    .from(fileMetadata)
    .where(and(
      eq(fileMetadata.tenantId, tenantId),
      eq(fileMetadata.filePath, normalizedPath),
      eq(fileMetadata.isDeleted, false),
    ))
    .limit(1)

  if (serverFile && baseHash && serverFile.contentHash !== baseHash) {
    // Conflict detected
    await db.insert(conflictLog).values({
      id: generateId(),
      tenantId,
      filePath: normalizedPath,
      serverHash: serverFile.contentHash,
      clientHash: sha256(content),
      userId,
    })

    log('warn', 'sync', 'conflict-detected', {
      tenantId, userId, filePath: normalizedPath,
      serverHash: serverFile.contentHash, clientHash: sha256(content),
    })

    return {
      accepted: false,
      conflict: { serverHash: serverFile.contentHash, clientHash: sha256(content) },
      version: serverFile.version,
    }
  }

  // Store the file
  const contentHash = await storeFile(tenantId, normalizedPath, content)
  const newVersion = (serverFile?.version ?? 0) + 1

  // Create version record
  await db.insert(fileVersions).values({
    id: generateId(),
    tenantId,
    filePath: normalizedPath,
    contentHash,
    sizeBytes: content.length,
    authorId: userId,
  })

  // Upsert file metadata (INSERT ON CONFLICT for concurrent upload safety)
  if (serverFile) {
    await db.update(fileMetadata)
      .set({
        contentHash,
        sizeBytes: content.length,
        version: newVersion,
        authorId: userId,
        updatedAt: new Date(),
      })
      .where(eq(fileMetadata.id, serverFile.id))
  } else {
    await db.insert(fileMetadata).values({
      id: generateId(),
      tenantId,
      filePath: normalizedPath,
      contentHash,
      sizeBytes: content.length,
      version: newVersion,
      authorId: userId,
    })
  }

  // Prune old versions (keep MAX_FILE_VERSIONS)
  const versions = await db.select()
    .from(fileVersions)
    .where(and(
      eq(fileVersions.tenantId, tenantId),
      eq(fileVersions.filePath, normalizedPath),
    ))
    .orderBy(fileVersions.createdAt)

  if (versions.length > MAX_FILE_VERSIONS) {
    const toDelete = versions.slice(0, versions.length - MAX_FILE_VERSIONS)
    for (const v of toDelete) {
      await db.delete(fileVersions).where(eq(fileVersions.id, v.id))
    }
  }

  log('info', 'sync', 'file-uploaded', {
    tenantId, userId, filePath: normalizedPath, contentHash, version: newVersion,
  })

  return { accepted: true, version: newVersion }
}

// ── File Download ────────────────────────────────────────

export async function downloadFile(
  db: Database,
  tenantId: string,
  userId: string,
  filePath: string,
): Promise<{ content: Buffer; hash: string; version: number }> {
  const normalizedPath = normalizePath(filePath)

  const perm = await resolvePermission(db, tenantId, userId, normalizedPath)
  if (!canRead(perm.role)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `No read permission for ${normalizedPath}`, 403)
  }

  const [file] = await db.select()
    .from(fileMetadata)
    .where(and(
      eq(fileMetadata.tenantId, tenantId),
      eq(fileMetadata.filePath, normalizedPath),
      eq(fileMetadata.isDeleted, false),
    ))
    .limit(1)

  if (!file) {
    throw new AppError(ErrorCode.FILE_NOT_FOUND, `File not found: ${normalizedPath}`, 404)
  }

  const content = await readStoredFile(tenantId, normalizedPath)
  return { content, hash: file.contentHash, version: file.version }
}

// ── File Delete (soft delete) ────────────────────────────

export async function softDeleteFile(
  db: Database,
  tenantId: string,
  userId: string,
  filePath: string,
): Promise<void> {
  const normalizedPath = normalizePath(filePath)

  const perm = await resolvePermission(db, tenantId, userId, normalizedPath)
  if (!canWrite(perm.role)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `No write permission for ${normalizedPath}`, 403)
  }

  const [file] = await db.select()
    .from(fileMetadata)
    .where(and(
      eq(fileMetadata.tenantId, tenantId),
      eq(fileMetadata.filePath, normalizedPath),
      eq(fileMetadata.isDeleted, false),
    ))
    .limit(1)

  if (!file) {
    throw new AppError(ErrorCode.FILE_NOT_FOUND, `File not found: ${normalizedPath}`, 404)
  }

  await db.update(fileMetadata)
    .set({ isDeleted: true, deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(fileMetadata.id, file.id))

  log('info', 'sync', 'file-soft-deleted', { tenantId, userId, filePath: normalizedPath })
}

// ── Conflict Stats ───────────────────────────────────────

export async function getConflictStats(
  db: Database,
  tenantId: string,
): Promise<{ totalThisWeek: number; byFile: { path: string; count: number }[] }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const conflicts = await db.select()
    .from(conflictLog)
    .where(eq(conflictLog.tenantId, tenantId))

  const thisWeek = conflicts.filter(c => new Date(c.createdAt) >= weekAgo)

  const byFile = new Map<string, number>()
  for (const c of thisWeek) {
    byFile.set(c.filePath, (byFile.get(c.filePath) || 0) + 1)
  }

  return {
    totalThisWeek: thisWeek.length,
    byFile: Array.from(byFile.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count),
  }
}
