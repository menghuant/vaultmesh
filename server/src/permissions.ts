import { eq, and } from 'drizzle-orm'
import {
  groups, groupMembers, folderPermissions, users,
  generateId, normalizeFolderPath, isUnderFolder,
  AppError, ErrorCode,
  type PermissionRole, type ResolvedPermission,
} from '@vaultmesh/shared'
import type { Database } from './db.js'

// ── Permission Resolution ────────────────────────────────

const ROLE_PRIORITY: Record<PermissionRole, number> = {
  none: 0,
  viewer: 1,
  editor: 2,
  owner: 3,
}

/**
 * Resolve the effective permission for a file path given a user's group memberships.
 *
 * Rules:
 * 1. Default: deny all (none)
 * 2. Longest prefix match per group
 * 3. Multi-group: most permissive wins
 */
export async function resolvePermission(
  db: Database,
  tenantId: string,
  userId: string,
  filePath: string,
): Promise<ResolvedPermission> {
  // Get all groups this user belongs to
  const memberships = await db.select({
    groupId: groupMembers.groupId,
    groupName: groups.name,
  })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groups.tenantId, tenantId)))

  if (memberships.length === 0) {
    return { path: filePath, role: 'none', via: '' }
  }

  // Get all folder permissions for these groups
  const groupIds = memberships.map(m => m.groupId)
  const allPerms = await db.select()
    .from(folderPermissions)
    .where(eq(folderPermissions.tenantId, tenantId))

  // Filter to relevant groups only
  const relevantPerms = allPerms.filter(p => groupIds.includes(p.groupId))

  let bestRole: PermissionRole = 'none'
  let bestVia = ''

  for (const membership of memberships) {
    // Find longest prefix match for this group
    const groupPerms = relevantPerms
      .filter(p => p.groupId === membership.groupId)
      .filter(p => isUnderFolder(filePath, p.folderPath))
      .sort((a, b) => b.folderPath.length - a.folderPath.length) // longest first

    if (groupPerms.length > 0) {
      const perm = groupPerms[0]!
      const role = perm.role as PermissionRole
      if (ROLE_PRIORITY[role] > ROLE_PRIORITY[bestRole]) {
        bestRole = role
        bestVia = membership.groupName
      }
    }
  }

  return { path: filePath, role: bestRole, via: bestVia }
}

/**
 * Get all folders a user has access to (for manifest filtering).
 * Returns an array of folder paths with their roles.
 */
export async function getUserPermittedFolders(
  db: Database,
  tenantId: string,
  userId: string,
): Promise<{ folderPath: string; role: PermissionRole }[]> {
  const memberships = await db.select({ groupId: groupMembers.groupId })
    .from(groupMembers)
    .innerJoin(groups, eq(groups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.userId, userId), eq(groups.tenantId, tenantId)))

  if (memberships.length === 0) return []

  const groupIds = memberships.map(m => m.groupId)
  const allPerms = await db.select()
    .from(folderPermissions)
    .where(eq(folderPermissions.tenantId, tenantId))

  // Group permissions by folder path, take most permissive
  const folderMap = new Map<string, PermissionRole>()

  for (const perm of allPerms) {
    if (!groupIds.includes(perm.groupId)) continue
    const role = perm.role as PermissionRole
    const existing = folderMap.get(perm.folderPath) || 'none'
    if (ROLE_PRIORITY[role] > ROLE_PRIORITY[existing]) {
      folderMap.set(perm.folderPath, role)
    }
  }

  return Array.from(folderMap.entries()).map(([folderPath, role]) => ({ folderPath, role }))
}

/**
 * Check if a user can perform an action on a file path.
 * viewer: can read
 * editor: can read + write
 * owner: can read + write + manage permissions
 */
export function canRead(role: PermissionRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY['viewer']
}

export function canWrite(role: PermissionRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY['editor']
}

export function canManage(role: PermissionRole): boolean {
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY['owner']
}

// ── Group Management ─────────────────────────────────────

export async function createGroup(db: Database, tenantId: string, name: string): Promise<string> {
  const existing = await db.select().from(groups)
    .where(and(eq(groups.tenantId, tenantId), eq(groups.name, name)))
    .limit(1)

  if (existing.length > 0) {
    throw new AppError(ErrorCode.GROUP_ALREADY_EXISTS, `Group "${name}" already exists`, 409)
  }

  const id = generateId()
  await db.insert(groups).values({ id, tenantId, name })
  return id
}

export async function addUserToGroup(db: Database, tenantId: string, groupId: string, userEmail: string): Promise<void> {
  const [group] = await db.select().from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.tenantId, tenantId)))
    .limit(1)

  if (!group) throw new AppError(ErrorCode.GROUP_NOT_FOUND, 'Group not found', 404)

  const [user] = await db.select().from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, userEmail)))
    .limit(1)

  if (!user) throw new AppError(ErrorCode.AUTH_FAILED, 'User not found', 404)

  const [existing] = await db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)))
    .limit(1)

  if (existing) throw new AppError(ErrorCode.USER_ALREADY_IN_GROUP, 'User already in group', 409)

  await db.insert(groupMembers).values({
    id: generateId(),
    groupId,
    userId: user.id,
  })
}

export async function removeUserFromGroup(db: Database, tenantId: string, groupId: string, userEmail: string): Promise<void> {
  const [group] = await db.select().from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.tenantId, tenantId)))
    .limit(1)

  if (!group) throw new AppError(ErrorCode.GROUP_NOT_FOUND, 'Group not found', 404)

  const [user] = await db.select().from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, userEmail)))
    .limit(1)

  if (!user) throw new AppError(ErrorCode.AUTH_FAILED, 'User not found', 404)

  const [existing] = await db.select().from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)))
    .limit(1)

  if (!existing) throw new AppError(ErrorCode.USER_NOT_IN_GROUP, 'User not in group', 404)

  await db.delete(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, user.id)))
}

export async function setFolderPermission(
  db: Database,
  tenantId: string,
  groupId: string,
  folderPath: string,
  role: 'viewer' | 'editor' | 'owner',
): Promise<void> {
  const normalizedPath = normalizeFolderPath(folderPath)

  const [group] = await db.select().from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.tenantId, tenantId)))
    .limit(1)

  if (!group) throw new AppError(ErrorCode.GROUP_NOT_FOUND, 'Group not found', 404)

  // Upsert: if permission exists, update role. Otherwise insert.
  const [existing] = await db.select().from(folderPermissions)
    .where(and(
      eq(folderPermissions.tenantId, tenantId),
      eq(folderPermissions.groupId, groupId),
      eq(folderPermissions.folderPath, normalizedPath),
    ))
    .limit(1)

  if (existing) {
    await db.update(folderPermissions)
      .set({ role })
      .where(eq(folderPermissions.id, existing.id))
  } else {
    await db.insert(folderPermissions).values({
      id: generateId(),
      tenantId,
      groupId,
      folderPath: normalizedPath,
      role,
    })
  }
}
