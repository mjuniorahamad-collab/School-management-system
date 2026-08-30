// Opaque session tokens. The raw token is sent to the client (httpOnly cookie)
// and only its sha-256 hash is ever stored, so a database leak cannot be used
// to mint sessions.

import { createHash, randomBytes } from "node:crypto"

export function generateToken(): string {
  return randomBytes(32).toString("base64url")
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}