import type { Session } from "./types";

export function parseToken(token: string): { userId: string; exp: number } | null {
  // Placeholder — replace with jose or jsonwebtoken in implementation
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      userId: string;
      exp: number;
    };
  } catch {
    return null;
  }
}

export function isSessionValid(session: Session): boolean {
  return session.expiresAt > new Date();
}
