import { eq, and } from 'drizzle-orm'
import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose'
import { hash, verify } from '@node-rs/argon2'
import {
  tenants, users, refreshTokens, inviteTokens, tenantPlans, groups, groupMembers,
  generateId, sha256, generateSecret, encodeInviteToken,
  AppError, ErrorCode,
  JWT_ACCESS_TOKEN_EXPIRY, JWT_REFRESH_TOKEN_EXPIRY_DAYS, INVITE_TOKEN_EXPIRY_HOURS,
  type JWTPayload, type SignupRequest, type SignupResponse,
  type LoginRequest, type LoginResponse,
  type InviteRequest, type InviteResponse,
  type RedeemRequest, type RedeemResponse,
  type RefreshRequest, type RefreshResponse,
} from '@vaultmesh/shared'
import type { Database } from './db.js'

const JWT_SECRET = new TextEncoder().encode(
  process.env.VAULTMESH_JWT_SECRET || 'dev-secret-change-in-production'
)

const SERVER_URL = process.env.VAULTMESH_SERVER_URL || 'http://localhost:4000'

// ── JWT helpers ──────────────────────────────────────────

async function signAccessToken(userId: string, tenantId: string, role: 'admin' | 'member'): Promise<string> {
  return new SignJWT({ tenant_id: tenantId, role } as unknown as JosePayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(JWT_ACCESS_TOKEN_EXPIRY)
    .sign(JWT_SECRET)
}

async function createRefreshToken(db: Database, userId: string, tenantId: string): Promise<string> {
  const rawToken = generateSecret(48)
  const tokenHash = sha256(rawToken)
  const expiresAt = new Date(Date.now() + JWT_REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  await db.insert(refreshTokens).values({
    id: generateId(),
    userId,
    tenantId,
    tokenHash,
    expiresAt,
  })

  return rawToken
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return {
      sub: payload.sub!,
      tenant_id: (payload as any).tenant_id,
      role: (payload as any).role,
      iat: payload.iat!,
      exp: payload.exp!,
    }
  } catch {
    throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Invalid or expired token', 401)
  }
}

// ── Auth Service ─────────────────────────────────────────

export async function signup(db: Database, req: SignupRequest): Promise<SignupResponse> {
  const tenantSlug = req.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const tenantId = generateId()
  const userId = generateId()

  // Check if email already exists (across all tenants for simplicity)
  const existing = await db.select().from(users).where(eq(users.email, req.email)).limit(1)
  if (existing.length > 0) {
    throw new AppError(ErrorCode.EMAIL_ALREADY_EXISTS, 'Email already registered', 409)
  }

  const passwordHash = await hash(req.password)

  // Create tenant
  await db.insert(tenants).values({
    id: tenantId,
    name: req.tenantName,
    slug: tenantSlug,
  })

  // Create default plan (self-hosted, unlimited)
  await db.insert(tenantPlans).values({
    id: generateId(),
    tenantId,
    plan: 'self-hosted',
  })

  // Create admin user
  await db.insert(users).values({
    id: userId,
    tenantId,
    email: req.email,
    passwordHash,
    role: 'admin',
    status: 'active',
  })

  // Create default "everyone" group and add admin to it
  const groupId = generateId()
  await db.insert(groups).values({
    id: groupId,
    tenantId,
    name: 'everyone',
  })

  await db.insert(groupMembers).values({
    id: generateId(),
    groupId,
    userId,
  })

  // Grant root folder access to everyone group
  const { folderPermissions } = await import('@vaultmesh/shared')
  await db.insert(folderPermissions).values({
    id: generateId(),
    tenantId,
    groupId,
    folderPath: '/',
    role: 'owner',
  })

  const accessToken = await signAccessToken(userId, tenantId, 'admin')
  const refreshToken = await createRefreshToken(db, userId, tenantId)

  return { tenantId, userId, accessToken, refreshToken }
}

export async function login(db: Database, req: LoginRequest): Promise<LoginResponse> {
  const [user] = await db.select().from(users).where(eq(users.email, req.email)).limit(1)
  if (!user || !user.passwordHash) {
    throw new AppError(ErrorCode.AUTH_FAILED, 'Invalid email or password', 401)
  }

  const valid = await verify(user.passwordHash, req.password)
  if (!valid) {
    throw new AppError(ErrorCode.AUTH_FAILED, 'Invalid email or password', 401)
  }

  if (user.status !== 'active') {
    throw new AppError(ErrorCode.AUTH_FAILED, 'Account not yet activated', 401)
  }

  const accessToken = await signAccessToken(user.id, user.tenantId, user.role as 'admin' | 'member')
  const refreshToken = await createRefreshToken(db, user.id, user.tenantId)

  return { accessToken, refreshToken, userId: user.id, tenantId: user.tenantId }
}

export async function invite(db: Database, tenantId: string, req: InviteRequest): Promise<InviteResponse> {
  const secret = generateSecret()
  const tokenHash = sha256(secret)
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

  // Create pending user if they don't exist in this tenant
  const [existingUser] = await db.select().from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, req.email)))
    .limit(1)

  if (existingUser && existingUser.status === 'active') {
    throw new AppError(ErrorCode.EMAIL_ALREADY_EXISTS, 'User already exists in this tenant', 409)
  }

  let userId: string
  if (!existingUser) {
    userId = generateId()
    await db.insert(users).values({
      id: userId,
      tenantId,
      email: req.email,
      role: req.role,
      status: 'invited',
    })
  } else {
    userId = existingUser.id
  }

  // Add to group if specified
  if (req.groupId) {
    const [group] = await db.select().from(groups)
      .where(and(eq(groups.id, req.groupId), eq(groups.tenantId, tenantId)))
      .limit(1)
    if (!group) {
      throw new AppError(ErrorCode.GROUP_NOT_FOUND, 'Group not found', 404)
    }

    // Check if already in group
    const [existing] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, req.groupId), eq(groupMembers.userId, userId)))
      .limit(1)
    if (!existing) {
      await db.insert(groupMembers).values({
        id: generateId(),
        groupId: req.groupId,
        userId,
      })
    }
  }

  await db.insert(inviteTokens).values({
    id: generateId(),
    tenantId,
    email: req.email,
    role: req.role,
    groupId: req.groupId ?? null,
    tokenHash,
    expiresAt,
  })

  const inviteToken = encodeInviteToken({
    serverUrl: SERVER_URL,
    secret,
    expiresAt: expiresAt.toISOString(),
  })

  return { inviteToken, expiresAt: expiresAt.toISOString() }
}

export async function redeem(db: Database, req: RedeemRequest): Promise<RedeemResponse> {
  // Decode the invite token to get the secret
  const { decodeInviteToken } = await import('@vaultmesh/shared')
  const tokenData = decodeInviteToken(req.token)
  if (!tokenData) {
    throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid invite token', 400)
  }

  const tokenHash = sha256(tokenData.secret)

  // Find the invite token
  const [invite] = await db.select().from(inviteTokens)
    .where(eq(inviteTokens.tokenHash, tokenHash))
    .limit(1)

  if (!invite) {
    throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid invite token', 400)
  }

  if (invite.redeemedAt) {
    throw new AppError(ErrorCode.INVITE_ALREADY_REDEEMED, 'Invite already used', 400)
  }

  if (new Date(invite.expiresAt) < new Date()) {
    throw new AppError(ErrorCode.INVITE_EXPIRED, 'Invite has expired', 400)
  }

  // Find the pending user
  const [user] = await db.select().from(users)
    .where(and(eq(users.tenantId, invite.tenantId), eq(users.email, invite.email)))
    .limit(1)

  if (!user) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, 'Pending user not found', 500)
  }

  // Activate user
  const passwordHash = await hash(req.password)
  await db.update(users)
    .set({
      passwordHash,
      displayName: req.displayName || null,
      status: 'active',
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))

  // Mark invite as redeemed
  await db.update(inviteTokens)
    .set({ redeemedAt: new Date() })
    .where(eq(inviteTokens.id, invite.id))

  // Add to "everyone" group if not already in any group
  const [everyoneGroup] = await db.select().from(groups)
    .where(and(eq(groups.tenantId, invite.tenantId), eq(groups.name, 'everyone')))
    .limit(1)

  if (everyoneGroup) {
    const [existingMembership] = await db.select().from(groupMembers)
      .where(and(eq(groupMembers.groupId, everyoneGroup.id), eq(groupMembers.userId, user.id)))
      .limit(1)
    if (!existingMembership) {
      await db.insert(groupMembers).values({
        id: generateId(),
        groupId: everyoneGroup.id,
        userId: user.id,
      })
    }
  }

  const accessToken = await signAccessToken(user.id, invite.tenantId, invite.role as 'admin' | 'member')
  const refreshToken = await createRefreshToken(db, user.id, invite.tenantId)

  return { accessToken, refreshToken, userId: user.id, tenantId: invite.tenantId }
}

export async function refresh(db: Database, req: RefreshRequest): Promise<RefreshResponse> {
  const tokenHash = sha256(req.refreshToken)

  const [token] = await db.select().from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1)

  if (!token) {
    throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid refresh token', 401)
  }

  if (new Date(token.expiresAt) < new Date()) {
    // Clean up expired token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, token.id))
    throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh token expired', 401)
  }

  // Get user for role info
  const [user] = await db.select().from(users).where(eq(users.id, token.userId)).limit(1)
  if (!user) {
    throw new AppError(ErrorCode.AUTH_FAILED, 'User not found', 401)
  }

  // Rotate: delete old token, create new pair
  await db.delete(refreshTokens).where(eq(refreshTokens.id, token.id))

  const accessToken = await signAccessToken(user.id, token.tenantId, user.role as 'admin' | 'member')
  const newRefreshToken = await createRefreshToken(db, user.id, token.tenantId)

  return { accessToken, refreshToken: newRefreshToken }
}
