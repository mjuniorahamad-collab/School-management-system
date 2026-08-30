import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "../src/auth/password.js"

describe("password hashing", () => {
  it("produces a scrypt-formatted hash with six fields", () => {
    const hash = hashPassword("correct horse battery staple")
    expect(hash.startsWith("scrypt$")).toBe(true)
    expect(hash.split("$")).toHaveLength(6)
  })

  it("verifies the correct password and rejects wrong ones", () => {
    const hash = hashPassword("s3cret-pass")
    expect(verifyPassword("s3cret-pass", hash)).toBe(true)
    expect(verifyPassword("s3cret-pasX", hash)).toBe(false)
    expect(verifyPassword("", hash)).toBe(false)
  })

  it("is salted: hashing the same password twice yields different hashes", () => {
    const a = hashPassword("same-password")
    const b = hashPassword("same-password")
    expect(a).not.toBe(b)
    expect(verifyPassword("same-password", a)).toBe(true)
    expect(verifyPassword("same-password", b)).toBe(true)
  })

  it("rejects malformed hashes safely", () => {
    expect(verifyPassword("anything", "not-a-hash")).toBe(false)
    expect(verifyPassword("anything", "scrypt$not$a$valid$hash")).toBe(false)
  })
})