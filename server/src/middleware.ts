import { createMiddleware } from 'hono/factory'
import { verifyAccessToken } from './auth.js'
import { AppError, ErrorCode, type JWTPayload } from '@vaultmesh/shared'

declare module 'hono' {
  interface ContextVariableMap {
    user: JWTPayload
  }
}

/** Auth middleware: extracts and verifies JWT from Authorization header */
export const authMiddleware = createMiddleware(async (c, next) => {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(ErrorCode.AUTH_FAILED, 'Missing or invalid Authorization header', 401)
  }

  const token = authHeader.slice(7)
  const payload = await verifyAccessToken(token)
  c.set('user', payload)
  await next()
})

/** Admin-only middleware: requires role=admin */
export const adminMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user')
  if (user.role !== 'admin') {
    throw new AppError(ErrorCode.PERMISSION_DENIED, 'Admin access required', 403)
  }
  await next()
})
