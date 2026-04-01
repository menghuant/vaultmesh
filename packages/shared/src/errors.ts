export enum ErrorCode {
  // Auth errors
  AUTH_FAILED = 'AUTH_FAILED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  INVITE_EXPIRED = 'INVITE_EXPIRED',
  INVITE_ALREADY_REDEEMED = 'INVITE_ALREADY_REDEEMED',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',

  // Tenant errors
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  TENANT_NOT_FOUND = 'TENANT_NOT_FOUND',

  // Permission errors
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  GROUP_NOT_FOUND = 'GROUP_NOT_FOUND',
  GROUP_ALREADY_EXISTS = 'GROUP_ALREADY_EXISTS',
  USER_NOT_IN_GROUP = 'USER_NOT_IN_GROUP',
  USER_ALREADY_IN_GROUP = 'USER_ALREADY_IN_GROUP',

  // File errors
  CONFLICT = 'CONFLICT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  PATH_COLLISION = 'PATH_COLLISION',
  FILE_DELETED = 'FILE_DELETED',

  // Server errors
  STORAGE_ERROR = 'STORAGE_ERROR',
  DB_ERROR = 'DB_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // Limit errors
  USER_LIMIT_REACHED = 'USER_LIMIT_REACHED',
  STORAGE_LIMIT_REACHED = 'STORAGE_LIMIT_REACHED',
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public statusCode: number = 400,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function authFailed(reason: string): AppError {
  return new AppError(ErrorCode.AUTH_FAILED, reason, 401)
}

export function tokenExpired(): AppError {
  return new AppError(ErrorCode.TOKEN_EXPIRED, 'Token has expired', 401)
}

export function permissionDenied(path?: string): AppError {
  const msg = path ? `Permission denied for ${path}` : 'Permission denied'
  return new AppError(ErrorCode.PERMISSION_DENIED, msg, 403)
}

export function notFound(entity: string): AppError {
  return new AppError(ErrorCode.FILE_NOT_FOUND, `${entity} not found`, 404)
}

export function conflict(path: string, serverHash: string, clientHash: string): AppError {
  const err = new AppError(ErrorCode.CONFLICT, `Conflict on ${path}`, 409)
  ;(err as any).serverHash = serverHash
  ;(err as any).clientHash = clientHash
  return err
}

export function fileTooLarge(sizeBytes: number): AppError {
  const mb = Math.round(sizeBytes / 1024 / 1024)
  return new AppError(ErrorCode.FILE_TOO_LARGE, `File too large: ${mb}MB (max 50MB)`, 413)
}

export function pathCollision(path: string): AppError {
  return new AppError(ErrorCode.PATH_COLLISION, `Case-insensitive path collision: ${path}`, 409)
}
