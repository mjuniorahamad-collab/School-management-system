import { describe, expect, it } from "vitest"
import {
  buildRedactedDiff,
  isSensitiveField,
  normalizeFieldKey,
  redactObject,
} from "../src/modules/audit-logs/audit-log.redact.js"

describe("auditLog redaction helpers", () => {
  it("normalizes compound field keys for exact matching", () => {
    expect(normalizeFieldKey("accessTokenHash")).toBe("accesstokenhash")
    expect(normalizeFieldKey("access_token_hash")).toBe("accesstokenhash")
    expect(normalizeFieldKey("Password")).toBe("password")
  })

  it("flags credential-bearing field names", () => {
    expect(isSensitiveField("password")).toBe(true)
    expect(isSensitiveField("passwordHash")).toBe(true)
    expect(isSensitiveField("refreshTokenHash")).toBe(true)
    expect(isSensitiveField("idempotencyKey")).toBe(true)
    expect(isSensitiveField("cvv")).toBe(true)
    expect(isSensitiveField("cardNumber")).toBe(true)
    expect(isSensitiveField("apiKey")).toBe(true)
  })

  it("does not false-positive on safe field names", () => {
    expect(isSensitiveField("tokenBalance")).toBe(false)
    expect(isSensitiveField("firstName")).toBe(false)
    expect(isSensitiveField("amountPaid")).toBe(false)
    expect(isSensitiveField("status")).toBe(false)
  })

  it("replaces sensitive values with the redaction placeholder", () => {
    const raw = {
      name: "Ada",
      passwordHash: "scrypt$...",
      idempotencyKey: "payment-key-123",
    }
    const redacted = redactObject(raw)
    expect(redacted.passwordHash).toBe("[REDACTED]")
    expect(redacted.idempotencyKey).toBe("[REDACTED]")
    expect(redacted.name).toBe("Ada")
  })

  it("redacts nested objects and leaves arrays safe", () => {
    const raw = {
      guardian: { name: "Grace", phone: "1234", accessToken: "raw-token" },
      tags: ["a", "b"],
    }
    const redacted = redactObject(raw)
    expect(redacted.guardian).toEqual({ name: "Grace", phone: "1234", accessToken: "[REDACTED]" })
    expect(redacted.tags).toEqual(["a", "b"])
  })

  it("truncates over-long strings to a bounded size", () => {
    const long = "x".repeat(8000)
    const redacted = redactObject({ notes: long })
    expect((redacted.notes as string).length).toBeLessThanOrEqual(4001)
  })
})

describe("buildRedactedDiff", () => {
  it("returns only changed non-sensitive fields", () => {
    const diff = buildRedactedDiff(
      { status: "ACTIVE", email: "a@x.io", createdAt: "t0" },
      { status: "INACTIVE", email: "a@x.io", createdAt: "t0" },
    )
    expect(diff?.fields).toHaveLength(1)
    expect(diff?.fields[0]).toEqual({ field: "status", before: "ACTIVE", after: "INACTIVE" })
  })

  it("omits sensitive fields entirely", () => {
    const diff = buildRedactedDiff(
      { status: "ACTIVE", passwordHash: "old-hash", newPassword: "plain" },
      { status: "ACTIVE", passwordHash: "new-hash", newPassword: "secret" },
    )
    expect(diff?.fields).toBeUndefined()
    expect(diff).toBeNull()
  })

  it("records create-style diffs with only an after side", () => {
    const diff = buildRedactedDiff(null, { firstName: "Ada", admissionNumber: "ADM/1" })
    expect(diff?.fields).toHaveLength(2)
    const entry = diff?.fields.find((field) => field.field === "firstName")
    expect(entry?.after).toBe("Ada")
    expect(entry?.before).toBeUndefined()
  })

  it("returns null for identical objects", () => {
    expect(buildRedactedDiff({ a: 1 }, { a: 1 })).toBeNull()
  })

  it("handles nested changed values with redaction", () => {
    const diff = buildRedactedDiff(
      { student: { name: "Ada", idempotencyKey: "k-1" } },
      { student: { name: "Ada", idempotencyKey: "k-2" } },
    )
    expect(diff?.fields[0].after).toEqual({ name: "Ada", idempotencyKey: "[REDACTED]" })
  })

  it("caps the number of captured fields", () => {
    const before: Record<string, unknown> = {}
    const after: Record<string, unknown> = {}
    for (let index = 0; index < 100; index += 1) {
      before[`field${index}`] = 0
      after[`field${index}`] = index
    }
    const diff = buildRedactedDiff(before, after)
    expect(diff?.fields.length).toBeLessThanOrEqual(40)
  })
})