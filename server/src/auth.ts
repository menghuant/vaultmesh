import { eq, and, lt, isNull } from 'drizzle-orm'
import { SignJWT, jwtVerify, type JWTPayload as JosePayload } from 'jose'
import { hash, verify } from '@node-rs/argon2'
import {
  tenants, users, refreshTokens, inviteTokens, tenantPlans, groups, groupMembers,
  folderPermissions,
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

// #1: Refuse to start with default JWT secret
const KNOWN_DEFAULTS = ['dev-secret-change-in-production', 'change-me-in-production']
const jwtSecretRaw = process.env.VAULTMESH_JWT_SECRET
if (!jwtSecretRaw || KNOWN_DEFAULTS.includes(jwtSecretRaw)) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('VAULTMESH_JWT_SECRET must be set in production. Generate one: openssl rand -base64 32')
  }
  console.warn('WARNING: Using default JWT secret. Set VAULTMESH_JWT_SECRET for production.')
}
const JWT_SECRET = new TextEncoder().encode(jwtSecretRaw || 'dev-secret-change-in-production')

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

async function createRefreshToken(db: Database | Parameters<Parameters<Database['transaction']>[0]>[0], userId: string, tenantId: string): Promise<string> {
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

// #18: Validate JWT claims after verification
export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    const sub = payload.sub
    const tenant_id = (payload as any).tenant_id
    const role = (payload as any).role

    if (!sub || !tenant_id || !role) {
      throw new Error('Missing required JWT claims')
    }
    if (role !== 'admin' && role !== 'member') {
      throw new Error('Invalid role claim')
    }

    return {
      sub,
      tenant_id,
      role,
      iat: payload.iat!,
      exp: payload.exp!,
    }
  } catch {
    throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Invalid or expired token', 401)
  }
}

// ── Auth Service ─────────────────────────────────────────

// #6: Wrap signup in transaction to prevent orphan rows
export async function signup(db: Database, req: SignupRequest): Promise<SignupResponse> {
  const tenantSlug = req.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  // #17: Reject empty slugs
  if (!tenantSlug) {
    throw new AppError(ErrorCode.TENANT_NOT_FOUND, 'Tenant name must contain at least one letter or number', 400)
  }

  const passwordHash = await hash(req.password)
  const tenantId = generateId()
  const userId = generateId()
  const groupId = generateId()

  try {
    await db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        id: tenantId,
        name: req.tenantName,
        slug: tenantSlug,
      })

      await tx.insert(tenantPlans).values({
        id: generateId(),
        tenantId,
        plan: 'self-hosted',
      })

      await tx.insert(users).values({
        id: userId,
        tenantId,
        email: req.email,
        passwordHash,
        role: 'admin',
        status: 'active',
      })

      await tx.insert(groups).values({
        id: groupId,
        tenantId,
        name: 'everyone',
      })

      await tx.insert(groupMembers).values({
        id: generateId(),
        groupId,
        userId,
      })

      await tx.insert(folderPermissions).values({
        id: generateId(),
        tenantId,
        groupId,
        folderPath: '/',
        role: 'owner',
      })
    })
  } catch (err: any) {
    if (err.code === '23505') {
      throw new AppError(ErrorCode.EMAIL_ALREADY_EXISTS, 'Tenant name or email already taken', 409)
    }
    throw err
  }

  const accessToken = await signAccessToken(userId, tenantId, 'admin')
  const refreshToken = await createRefreshToken(db, userId, tenantId)

  return { tenantId, userId, accessToken, refreshToken }
}

export async function login(db: Database, req: LoginRequest): Promise<LoginResponse> {
  const [user] = await db.select().from(users)
    .where(and(eq(users.tenantId, req.tenantId), eq(users.email, req.email)))
    .limit(1)
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

// #22: Validate invite role
export async function invite(db: Database, tenantId: string, req: InviteRequest): Promise<InviteResponse> {
  const validRoles = ['admin', 'member'] as const
  if (!validRoles.includes(req.role as any)) {
    throw new AppError(ErrorCode.PERMISSION_DENIED, `Invalid role: ${req.role}. Must be admin or member`, 400)
  }

  const secret = generateSecret()
  const tokenHash = sha256(secret)
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000)

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

  if (req.groupId) {
    const [group] = await db.select().from(groups)
      .where(and(eq(groups.id, req.groupId), eq(groups.tenantId, tenantId)))
      .limit(1)
    if (!group) {
      throw new AppError(ErrorCode.GROUP_NOT_FOUND, 'Group not found', 404)
    }

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

// #7: Wrap redeem in transaction, use atomic redeem check
export async function redeem(db: Database, req: RedeemRequest): Promise<RedeemResponse> {
  const { decodeInviteToken } = await import('@vaultmesh/shared')
  const tokenData = decodeInviteToken(req.token)
  if (!tokenData) {
    throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid invite token', 400)
  }

  const tokenHash = sha256(tokenData.secret)
  const passwordHash = await hash(req.password)

  return await db.transaction(async (tx) => {
    // Atomic redeem: UPDATE WHERE redeemedAt IS NULL returns affected rows
    const [invite] = await tx.select().from(inviteTokens)
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

    // Mark invite as redeemed first (prevents concurrent redeem)
    const updated = await tx.update(inviteTokens)
      .set({ redeemedAt: new Date() })
      .where(and(eq(inviteTokens.id, invite.id), isNull(inviteTokens.redeemedAt)))
      .returning({ id: inviteTokens.id })

    if (updated.length === 0) {
      throw new AppError(ErrorCode.INVITE_ALREADY_REDEEMED, 'Invite already used', 400)
    }

    const [user] = await tx.select().from(users)
      .where(and(eq(users.tenantId, invite.tenantId), eq(users.email, invite.email)))
      .limit(1)

    if (!user) {
      throw new AppError(ErrorCode.INTERNAL_ERROR, 'Pending user not found', 500)
    }

    await tx.update(users)
      .set({
        passwordHash,
        displayName: req.displayName || null,
        status: 'active',
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))

    // Add to "everyone" group if not already
    const [everyoneGroup] = await tx.select().from(groups)
      .where(and(eq(groups.tenantId, invite.tenantId), eq(groups.name, 'everyone')))
      .limit(1)

    if (everyoneGroup) {
      const [existingMembership] = await tx.select().from(groupMembers)
        .where(and(eq(groupMembers.groupId, everyoneGroup.id), eq(groupMembers.userId, user.id)))
        .limit(1)
      if (!existingMembership) {
        await tx.insert(groupMembers).values({
          id: generateId(),
          groupId: everyoneGroup.id,
          userId: user.id,
        })
      }
    }

    const accessToken = await signAccessToken(user.id, invite.tenantId, invite.role as 'admin' | 'member')
    const refreshToken = await createRefreshToken(tx, user.id, invite.tenantId)

    return { accessToken, refreshToken, userId: user.id, tenantId: invite.tenantId }
  })
}

// #8: Wrap refresh in transaction, #14: clean expired tokens
export async function refresh(db: Database, req: RefreshRequest): Promise<RefreshResponse> {
  const tokenHash = sha256(req.refreshToken)

  return await db.transaction(async (tx) => {
    const [token] = await tx.select().from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1)

    if (!token) {
      throw new AppError(ErrorCode.TOKEN_INVALID, 'Invalid refresh token', 401)
    }

    if (new Date(token.expiresAt) < new Date()) {
      await tx.delete(refreshTokens).where(eq(refreshTokens.id, token.id))
      throw new AppError(ErrorCode.TOKEN_EXPIRED, 'Refresh token expired', 401)
    }

    const [user] = await tx.select().from(users).where(eq(users.id, token.userId)).limit(1)
    if (!user) {
      throw new AppError(ErrorCode.AUTH_FAILED, 'User not found', 401)
    }

    // Rotate: delete old token, create new pair
    await tx.delete(refreshTokens).where(eq(refreshTokens.id, token.id))

    const accessToken = await signAccessToken(user.id, token.tenantId, user.role as 'admin' | 'member')
    const newRefreshToken = await createRefreshToken(tx, user.id, token.tenantId)

    // #14: Batch clean expired tokens (opportunistic, non-blocking)
    await tx.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()))

    return { accessToken, refreshToken: newRefreshToken }
  })
}
