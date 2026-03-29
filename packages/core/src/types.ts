export interface VaultDocument {
  id: string;
  path: string;
  content: string;
  checksum: string;
  updatedAt: Date;
  updatedBy: string;
}

export interface SyncState {
  vaultId: string;
  userId: string;
  lastSyncedAt: Date;
  vectorClock: Record<string, number>;
}

export interface ConflictResolution {
  strategy: "ours" | "theirs" | "merge" | "manual";
  resolvedContent?: string;
}
