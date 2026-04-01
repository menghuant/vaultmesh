# TODOS

## Phase 2

### Linux systemd support
- **What:** Add OS detection to install script. Use systemd unit file for daemon management on Linux (currently macOS launchd only).
- **Why:** Open source + SaaS targets require Linux support. Many developers use Linux.
- **Effort:** CC ~15min
- **Depends on:** Daemon binary complete
- **Source:** /plan-eng-review 2026-03-31, outside voice feedback

### Rename detection with content changes
- **What:** Current rename detection only catches pure renames (identical hash). Add similarity threshold to detect rename + content modification.
- **Why:** IDE refactoring often renames + modifies simultaneously. Currently falls back to delete + create, breaking version history.
- **Effort:** CC ~30min
- **Depends on:** Phase 1 basic rename detection complete
- **Source:** /plan-eng-review 2026-03-31

### TUI status dashboard (`vaultmesh status`)
- **What:** CLI command showing sync status, connection state, recent changes, who's online.
- **Why:** Phase 1 has no UI. Users can't tell if daemon is working.
- **Effort:** CC ~1h
- **Depends on:** Phase 1 complete
- **Source:** CEO plan 2026-03-31, deferred from Phase 1

### Per-tenant backup strategy
- **What:** Scheduled per-tenant tar snapshots of /data/{tenant_id}/ with configurable retention. CLI: `vaultmesh backup` (manual) + cron automation.
- **Why:** Disk corruption = all tenant data gone. Outside voice flagged as critical gap. Phase 1 has no backup mechanism.
- **Effort:** CC ~1h (CLI command) + ~30min (cron setup)
- **Depends on:** Phase 1 storage backend complete
- **Source:** /plan-eng-review 2026-03-31, outside voice feedback

### S3/object storage migration
- **What:** Replace local disk file storage with S3/MinIO-compatible object storage. Design StorageBackend interface in Phase 1 so migration is a swap.
- **Why:** Single-disk architecture can't scale horizontally. At 50+ tenants, shared storage is required. Also enables CDN and cross-region replication.
- **Effort:** CC ~2h (interface extraction + S3 implementation)
- **Depends on:** Phase 1 StorageBackend interface designed with this in mind
- **Source:** /plan-eng-review 2026-03-31, outside voice feedback
