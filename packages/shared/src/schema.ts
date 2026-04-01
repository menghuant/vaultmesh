import { pgTable, text, timestamp, integer, bigint, boolean, uniqueIndex, index } from 'drizzle-orm/pg-core'

// ── Tenants ──────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(), // nanoid
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Users ────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  passwordHash: text('password_hash'), // null for invited-but-not-redeemed
  displayName: text('display_name'),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  status: text('status', { enum: ['invited', 'active'] }).notNull().default('invited'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('users_tenant_email_idx').on(table.tenantId, table.email),
])

// ── Groups ───────────────────────────────────────────────
export const groups = pgTable('groups', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('groups_tenant_name_idx').on(table.tenantId, table.name),
])

// ── Group Members ────────────────────────────────────────
export const groupMembers = pgTable('group_members', {
  id: text('id').primaryKey(), // nanoid
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('group_members_group_user_idx').on(table.groupId, table.userId),
])

// ── Folder Permissions ───────────────────────────────────
export const folderPermissions = pgTable('folder_permissions', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  groupId: text('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  folderPath: text('folder_path').notNull(), // e.g. "/" or "/engineering/"
  role: text('role', { enum: ['viewer', 'editor', 'owner'] }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('folder_perms_tenant_group_path_idx').on(table.tenantId, table.groupId, table.folderPath),
  index('folder_perms_tenant_idx').on(table.tenantId),
])

// ── File Metadata ────────────────────────────────────────
export const fileMetadata = pgTable('file_metadata', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  filePath: text('file_path').notNull(),
  contentHash: text('content_hash').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  version: integer('version').notNull().default(1), // monotonic per-file
  authorId: text('author_id').references(() => users.id),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('file_metadata_tenant_path_idx').on(table.tenantId, table.filePath),
  index('file_metadata_tenant_idx').on(table.tenantId),
])

// ── File Versions (content-addressable) ──────────────────
export const fileVersions = pgTable('file_versions', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  filePath: text('file_path').notNull(),
  contentHash: text('content_hash').notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  authorId: text('author_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('file_versions_tenant_path_idx').on(table.tenantId, table.filePath),
])

// ── Tenant Plans (SaaS hooks) ────────────────────────────
export const tenantPlans = pgTable('tenant_plans', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id).unique(),
  plan: text('plan', { enum: ['self-hosted', 'free', 'paid'] }).notNull().default('self-hosted'),
  maxUsers: integer('max_users'), // null = unlimited
  maxStorageBytes: bigint('max_storage_bytes', { mode: 'number' }), // null = unlimited
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Refresh Tokens ───────────────────────────────────────
export const refreshTokens = pgTable('refresh_tokens', {
  id: text('id').primaryKey(), // nanoid
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Invite Tokens ────────────────────────────────────────
export const inviteTokens = pgTable('invite_tokens', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  role: text('role', { enum: ['admin', 'member'] }).notNull().default('member'),
  groupId: text('group_id').references(() => groups.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Conflict Log ─────────────────────────────────────────
export const conflictLog = pgTable('conflict_log', {
  id: text('id').primaryKey(), // nanoid
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  filePath: text('file_path').notNull(),
  serverHash: text('server_hash').notNull(),
  clientHash: text('client_hash').notNull(),
  userId: text('user_id').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('conflict_log_tenant_idx').on(table.tenantId),
])
