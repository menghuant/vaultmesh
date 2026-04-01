import { describe, it, expect } from 'vitest'
import {
  AppError, ErrorCode,
  authFailed, tokenExpired, permissionDenied, notFound,
  conflict, fileTooLarge, pathCollision,
} from './errors.js'

describe('AppError', () => {
  it('creates error with code and status', () => {
    const err = new AppError(ErrorCode.AUTH_FAILED, 'bad creds', 401)
    expect(err.code).toBe('AUTH_FAILED')
    expect(err.message).toBe('bad creds')
    expect(err.statusCode).toBe(401)
    expect(err).toBeInstanceOf(Error)
  })
})

describe('error factory functions', () => {
  it('authFailed returns 401', () => {
    const err = authFailed('nope')
    expect(err.statusCode).toBe(401)
    expect(err.code).toBe(ErrorCode.AUTH_FAILED)
  })

  it('tokenExpired returns 401', () => {
    const err = tokenExpired()
    expect(err.statusCode).toBe(401)
  })

  it('permissionDenied returns 403', () => {
    const err = permissionDenied('/secret/')
    expect(err.statusCode).toBe(403)
    expect(err.message).toContain('/secret/')
  })

  it('notFound returns 404', () => {
    const err = notFound('file')
    expect(err.statusCode).toBe(404)
  })

  it('conflict returns 409', () => {
    const err = conflict('test.md', 'abc', 'def')
    expect(err.statusCode).toBe(409)
    expect(err.code).toBe(ErrorCode.CONFLICT)
  })

  it('fileTooLarge returns 413', () => {
    const err = fileTooLarge(100 * 1024 * 1024)
    expect(err.statusCode).toBe(413)
    expect(err.message).toContain('100MB')
  })

  it('pathCollision returns 409', () => {
    const err = pathCollision('README.md')
    expect(err.statusCode).toBe(409)
  })
})
