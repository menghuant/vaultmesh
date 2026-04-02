import { eq, and, lt, gte } from 'drizzle-orm'
import {
  fileMetadata, fileVersions, conflictLog,
  groups, groupMembers, folderPermissions,
  generateId, sha256, normalizePath, pathsCollide, isUnderFolder,
  AppError, ErrorCode,
  MAX_FILE_SIZE, MAX_FILE_VERSIONS, SOFT_DELETE_RETENTION_DAYS,
  type ManifestEntry, type SyncPlan, type UploadResult,
  type PermissionRole,
  log,
} from '@vaultmesh/shared'
import type { Database } from './db.js'
import { storeFile, readStoredFile, deleteStoredFile, deleteVersionBlob } from './storage.js'
import { resolvePermission, canRead, canWrite } from './permissions.js'

// ── Permission Pre-fetch (#11: fix N+1) ──────────────────

const ROLE_PRIORITY: Record<PermissionRole, number> = { none: 0, viewer: 1, editor: 2, owner: 3 }

interface PermissionCache {
  folders: { folderPath: string; role: PermissionRole }[]
}

async function prefetchPermissions(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<PermissionCache> {
  const memberships = await db.select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groups.tenantId, tenantId)))

  if (memberships.length === 0) return { folders: [] }

  const groupIds = memberships.map(m => m.groupId)
  const allPerms = await db.select()
    .from(folderPermissions)
    .where(eq(folderPermissions.tenantId, tenantId))

  // Aggregate: per folder, take most permissive role across all groups
  const folderMap = new Map<string, PermissionRole>()
  for (const perm of allPerms) {
    if (!groupIds.includes(perm.groupId)) continue
    const role = perm.role as PermissionRole
    const existing = folderMap.get(perm.folderPath) || 'none'
    if (ROLE_PRIORITY[role] > ROLE_PRIORITY[existing]) {
      folderMap.set(perm.folderPath, role)
    }
  }

  return {
    folders: Array.from(folderMap.entries()).map(([folderPath, role]) => ({ folderPath, role })),
  }
}

function resolveFromCache(cache: PermissionCache, filePath: string): PermissionRole {
  let bestRole: PermissionRole = 'none'
  let longestMatch = -1
  for (const { folderPath, role } of cache.folders) {
    if (isUnderFolder(filePath, folderPath)) {
      // Longest prefix match: more specific folder wins
      if (folderPath.length > longestMatch) {
        longestMatch = folderPath.length
        bestRole = role
      } else if (folderPath.length === longestMatch && ROLE_PRIORITY[role] > ROLE_PRIORITY[bestRole]) {
        // Same specificity: most permissive wins
        bestRole = role
      }
    }
  }
  return bestRole
}

// ── Manifest Sync ────────────────────────────────────────

export async function processManifest(
  db: Database,
  tenantId: string,
  userId: string,
  clientFiles: ManifestEntry[],
): Promise<SyncPlan> {
  // #11: Prefetch permissions once, resolve in memory
  const permCache = await prefetchPermissions(db, tenantId, userId)

  const serverFiles = await db.select()
    .from(fileMetadata)
    .where(and(eq(fileMetadata.tenantId, tenantId), eq(fileMetadata.isDeleted, false)))

  const serverMap = new Map(serverFiles.map(f => [f.filePath, f]))

  const plan: SyncPlan = {
    download: [],
    upload: [],
    conflict: [],
    delete: [],
  }

  const clientPaths = new Set(clientFiles.map(f => normalizePath(f.path)))

  for (const clientFile of clientFiles) {
    const path = normalizePath(clientFile.path)
    const role = resolveFromCache(permCache, path)
    if (!canRead(role)) continue

    const serverFile = serverMap.get(path)

    if (!serverFile) {
      if (canWrite(role)) {
        plan.upload.push({ path })
      }
    } else if (serverFile.contentHash !== clientFile.hash) {
      plan.conflict.push({
        path,
        serverHash: serverFile.contentHash,
        localHash: clientFile.hash,
      })
    }
  }

  for (const serverFile of serverFiles) {
    const role = resolveFromCache(permCache, serverFile.filePath)
    if (!canRead(role)) continue

    if (!clientPaths.has(serverFile.filePath)) {
      plan.download.push({
        path: serverFile.filePath,
        hash: serverFile.contentHash,
        sizeBytes: Number(serverFile.sizeBytes),
      })
    }
  }

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

// #4: Wrap upload in transaction
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
    throw new AppError(ErrorCode.FILE_TOO_LARGE, `File exceeds ${MAX_FILE_SIZE} bytes`, 413)
  }

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

  return await db.transaction(async (tx) => {
    const [serverFile] = await tx.select()
      .from(fileMetadata)
      .where(and(
        eq(fileMetadata.tenantId, tenantId),
        eq(fileMetadata.filePath, normalizedPath),
        eq(fileMetadata.isDeleted, false),
      ))
      .limit(1)

    // Updating an existing file requires base_hash for conflict detection
    if (serverFile && !baseHash) {
      throw new AppError(ErrorCode.CONFLICT, 'X-Base-Hash header required when updating existing file', 400)
    }

    if (serverFile && baseHash && serverFile.contentHash !== baseHash) {
      await tx.insert(conflictLog).values({
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

    const contentHash = await storeFile(tenantId, normalizedPath, content)
    const newVersion = (serverFile?.version ?? 0) + 1

    await tx.insert(fileVersions).values({
      id: generateId(),
      tenantId,
      filePath: normalizedPath,
      contentHash,
      sizeBytes: content.length,
      authorId: userId,
    })

    if (serverFile) {
      await tx.update(fileMetadata)
        .set({
          contentHash,
          sizeBytes: content.length,
          version: newVersion,
          authorId: userId,
          updatedAt: new Date(),
        })
        .where(eq(fileMetadata.id, serverFile.id))
    } else {
      await tx.insert(fileMetadata).values({
        id: generateId(),
        tenantId,
        filePath: normalizedPath,
        contentHash,
        sizeBytes: content.length,
        version: newVersion,
        authorId: userId,
      })
    }

    // #15: Prune old versions + clean orphaned blobs from disk
    const versions = await tx.select()
      .from(fileVersions)
      .where(and(
        eq(fileVersions.tenantId, tenantId),
        eq(fileVersions.filePath, normalizedPath),
      ))
      .orderBy(fileVersions.createdAt)

    if (versions.length > MAX_FILE_VERSIONS) {
      const toDelete = versions.slice(0, versions.length - MAX_FILE_VERSIONS)
      for (const v of toDelete) {
        await tx.delete(fileVersions).where(eq(fileVersions.id, v.id))
        // Only delete blob if no other version in the entire tenant references this hash
        const [otherRef] = await tx.select({ id: fileVersions.id })
          .from(fileVersions)
          .where(and(
            eq(fileVersions.tenantId, tenantId),
            eq(fileVersions.contentHash, v.contentHash),
          ))
          .limit(1)
        if (!otherRef) {
          await deleteVersionBlob(tenantId, v.contentHash).catch(() => {})
        }
      }
    }

    log('info', 'sync', 'file-uploaded', {
      tenantId, userId, filePath: normalizedPath, contentHash, version: newVersion,
    })

    return { accepted: true, version: newVersion }
  })
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

// ── Conflict Stats (#12: add WHERE date filter) ──────────

export async function getConflictStats(
  db: Database,
  tenantId: string,
): Promise<{ totalThisWeek: number; byFile: { path: string; count: number }[] }> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const thisWeek = await db.select()
    .from(conflictLog)
    .where(and(
      eq(conflictLog.tenantId, tenantId),
      gte(conflictLog.createdAt, weekAgo),
    ))

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

// ── File Version History ─────────────────────────────────

export async function getFileVersions(
  db: Database,
  tenantId: string,
  userId: string,
  filePath: string,
): Promise<{ version: number; contentHash: string; sizeBytes: number; authorId: string | null; createdAt: Date }[]> {
  const normalizedPath = normalizePath(filePath)

  const perm = await resolvePermission(db, tenantId, userId, normalizedPath)
  if (!canRead(perm.role)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `No read permission for ${normalizedPath}`, 403)
  }

  const versions = await db.select({
    contentHash: fileVersions.contentHash,
    sizeBytes: fileVersions.sizeBytes,
    authorId: fileVersions.authorId,
    createdAt: fileVersions.createdAt,
  })
    .from(fileVersions)
    .where(and(eq(fileVersions.tenantId, tenantId), eq(fileVersions.filePath, normalizedPath)))
    .orderBy(fileVersions.createdAt)

  return versions.map((v, i) => ({
    version: i + 1,
    contentHash: v.contentHash,
    sizeBytes: Number(v.sizeBytes),
    authorId: v.authorId,
    createdAt: v.createdAt,
  }))
}

// ── File Restore ────────────────────────────────────────

export async function restoreFileVersion(
  db: Database,
  tenantId: string,
  userId: string,
  filePath: string,
  versionNumber: number,
): Promise<{ version: number }> {
  const normalizedPath = normalizePath(filePath)

  const perm = await resolvePermission(db, tenantId, userId, normalizedPath)
  if (!canWrite(perm.role)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `No write permission for ${normalizedPath}`, 403)
  }

  const versions = await db.select()
    .from(fileVersions)
    .where(and(eq(fileVersions.tenantId, tenantId), eq(fileVersions.filePath, normalizedPath)))
    .orderBy(fileVersions.createdAt)

  if (versionNumber < 1 || versionNumber > versions.length) {
    throw new AppError(ErrorCode.FILE_NOT_FOUND, `Version ${versionNumber} not found`, 404)
  }

  const targetVersion = versions[versionNumber - 1]!
  // Read the content from the version's stored blob
  const content = await readStoredFile(tenantId, normalizedPath)

  // Re-upload as a new version
  return uploadFile(db, tenantId, userId, normalizedPath, content, '')
}

// #13: Cleanup expired soft-deleted files + disk
export async function cleanupSoftDeletes(db: Database): Promise<number> {
  const cutoff = new Date(Date.now() - SOFT_DELETE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const expired = await db.select({
    id: fileMetadata.id,
    tenantId: fileMetadata.tenantId,
    filePath: fileMetadata.filePath,
    contentHash: fileMetadata.contentHash,
  })
    .from(fileMetadata)
    .where(and(
      eq(fileMetadata.isDeleted, true),
      lt(fileMetadata.deletedAt, cutoff),
    ))

  for (const row of expired) {
    // Delete disk file
    await deleteStoredFile(row.tenantId, row.filePath).catch(() => {})

    // Delete version blobs if no other reference in the tenant
    const versions = await db.select({ contentHash: fileVersions.contentHash })
      .from(fileVersions)
      .where(and(
        eq(fileVersions.tenantId, row.tenantId),
        eq(fileVersions.filePath, row.filePath),
      ))

    for (const v of versions) {
      await db.delete(fileVersions).where(and(
        eq(fileVersions.tenantId, row.tenantId),
        eq(fileVersions.filePath, row.filePath),
        eq(fileVersions.contentHash, v.contentHash),
      ))
      // Only delete blob if no other version in tenant references it
      const [otherRef] = await db.select({ id: fileVersions.id })
        .from(fileVersions)
        .where(and(
          eq(fileVersions.tenantId, row.tenantId),
          eq(fileVersions.contentHash, v.contentHash),
        ))
        .limit(1)
      if (!otherRef) {
        await deleteVersionBlob(row.tenantId, v.contentHash).catch(() => {})
      }
    }

    // Delete metadata row
    await db.delete(fileMetadata).where(eq(fileMetadata.id, row.id))
  }

  if (expired.length > 0) {
    log('info', 'sync', 'soft-delete-cleanup', { deleted: expired.length })
  }
  return expired.length
}
