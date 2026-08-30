// Password hashing with Node's built-in scrypt (no native add-ons).
//
// Storage format: scrypt$N$r$p$saltBase64$keyBase64
// Parameters are stored with the hash so verify() can validate hashes even if
// the cost parameters change in a future release.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"

const SCRYPT_N = 16_384
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LENGTH = 64
const SALT_BYTES = 16

const SCRYPT_ALGORITHM = "scrypt"

function maxmemFor(n: number, r: number): number {
  // scrypt requires maxmem > 128 * N * r. Double it and pad for headroom.
  return 128 * n * r * 2 + 1024 * 1024
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const key = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: maxmemFor(SCRYPT_N, SCRYPT_R),
  })
  return [SCRYPT_ALGORITHM, SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString("base64"), key.toString("base64")].join("$")
}

export function verifyPassword(password: string, encoded: string): boolean {
  const parts = encoded.split("$")
  if (parts.length !== 6 || parts[0] !== SCRYPT_ALGORITHM) return false

  const n = Number(parts[1])
  const r = Number(parts[2])
  const p = Number(parts[3])
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const salt = Buffer.from(parts[4], "base64")
  const expected = Buffer.from(parts[5], "base64")
  const actual = scryptSync(password, salt, expected.length, {
    N: n,
    r,
    p,
    maxmem: maxmemFor(n, r),
  })

  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}