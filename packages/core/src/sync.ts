import type { VaultDocument, ConflictResolution } from "./types";

export function computeChecksum(content: string): string {
  // Placeholder — replace with crypto.subtle or node:crypto in implementation
  return Buffer.from(content).toString("base64").slice(0, 32);
}

export function detectConflict(local: VaultDocument, remote: VaultDocument): boolean {
  return local.checksum !== remote.checksum && local.updatedBy !== remote.updatedBy;
}

export function mergeDocuments(
  base: VaultDocument,
  local: VaultDocument,
  remote: VaultDocument,
  resolution: ConflictResolution
): string {
  switch (resolution.strategy) {
    case "ours":
      return local.content;
    case "theirs":
      return remote.content;
    case "merge":
      return resolution.resolvedContent ?? local.content;
    case "manual":
      return resolution.resolvedContent ?? base.content;
  }
}
