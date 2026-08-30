import { describe, expect, it } from "vitest"
import { generateToken, hashToken } from "../src/auth/tokens.js"

describe("session tokens", () => {
  it("generates unique base64url raw tokens", () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).not.toBe(b)
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it("hashes deterministically and never embeds the raw token", () => {
    const token = generateToken()
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toContain(token)
  })
})