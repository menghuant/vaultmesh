export interface User {
  id: string;
  email: string;
  displayName: string;
  createdAt: Date;
}

export interface Session {
  userId: string;
  token: string;
  expiresAt: Date;
}

export interface VaultPermission {
  vaultId: string;
  userId: string;
  role: "owner" | "editor" | "viewer";
}
