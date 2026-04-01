import { describe, it, expect } from 'vitest'
import { NoopBilling, NoopUserLimit, NoopAnalytics, NoopBackup } from './saas-hooks.js'

describe('NoopBilling', () => {
  it('always allows adding users', async () => {
    const billing = new NoopBilling()
    expect(await billing.checkCanAddUser('t1')).toBe(true)
  })

  it('recordStorageUsage is a no-op', async () => {
    const billing = new NoopBilling()
    await expect(billing.recordStorageUsage('t1', 1024)).resolves.toBeUndefined()
  })
})

describe('NoopUserLimit', () => {
  it('always passes user limit check', async () => {
    const limit = new NoopUserLimit()
    expect(await limit.checkUserLimit('t1', 999)).toBe(true)
  })

  it('returns null (unlimited) for max users', async () => {
    const limit = new NoopUserLimit()
    expect(await limit.getMaxUsers('t1')).toBeNull()
  })
})

describe('NoopAnalytics', () => {
  it('trackEvent is a no-op', () => {
    const analytics = new NoopAnalytics()
    expect(() => analytics.trackEvent('t1', 'test', { foo: 'bar' })).not.toThrow()
  })
})

describe('NoopBackup', () => {
  it('scheduleBackup is a no-op', async () => {
    const backup = new NoopBackup()
    await expect(backup.scheduleBackup('t1')).resolves.toBeUndefined()
  })

  it('runBackup returns empty string', async () => {
    const backup = new NoopBackup()
    expect(await backup.runBackup('t1')).toBe('')
  })
})
