// SaaS hook interfaces with Noop implementations for OSS build.
// Real implementations live in the proprietary vaultmesh-cloud repo.

export interface BillingService {
  checkCanAddUser(tenantId: string): Promise<boolean>
  recordStorageUsage(tenantId: string, bytes: number): Promise<void>
}

export interface UserLimitService {
  checkUserLimit(tenantId: string, currentCount: number): Promise<boolean>
  getMaxUsers(tenantId: string): Promise<number | null> // null = unlimited
}

export interface AnalyticsService {
  trackEvent(tenantId: string, event: string, data?: Record<string, unknown>): void
}

export interface BackupService {
  scheduleBackup(tenantId: string): Promise<void>
  runBackup(tenantId: string): Promise<string> // returns backup path
}

// ── Noop Implementations (OSS defaults) ──────────────────

export class NoopBilling implements BillingService {
  async checkCanAddUser(_tenantId: string): Promise<boolean> {
    return true // no billing in OSS
  }
  async recordStorageUsage(_tenantId: string, _bytes: number): Promise<void> {
    // no-op
  }
}

export class NoopUserLimit implements UserLimitService {
  async checkUserLimit(_tenantId: string, _currentCount: number): Promise<boolean> {
    return true // no limits in OSS
  }
  async getMaxUsers(_tenantId: string): Promise<number | null> {
    return null // unlimited
  }
}

export class NoopAnalytics implements AnalyticsService {
  trackEvent(_tenantId: string, _event: string, _data?: Record<string, unknown>): void {
    // no-op
  }
}

export class NoopBackup implements BackupService {
  async scheduleBackup(_tenantId: string): Promise<void> {
    // no-op
  }
  async runBackup(_tenantId: string): Promise<string> {
    return '' // no backup in OSS
  }
}
