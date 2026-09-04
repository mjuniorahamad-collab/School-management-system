import { describe, expect, it } from "vitest"
import { resolveStatusTransition } from "../src/modules/academic-sessions/academic-session.rules.js"
import { createSessionSchema } from "../src/modules/academic-sessions/academic-session.schema.js"

describe("resolveStatusTransition (database-free)", () => {
  it("defaults to UPCOMING for a new session with no explicit status", () => {
    const result = resolveStatusTransition({ current: null, allSessions: [] })
    expect(result.status).toBe("UPCOMING")
  })

  it("allows exactly one ACTIVE session", () => {
    const result = resolveStatusTransition({
      current: null,
      allSessions: [{ id: "a", status: "UPCOMING" }],
      requestedStatus: "ACTIVE",
    })
    expect(result.status).toBe("ACTIVE")
  })

  it("rejects a second ACTIVE session", () => {
    expect(() =>
      resolveStatusTransition({
        current: null,
        allSessions: [{ id: "a", status: "ACTIVE" }],
        requestedStatus: "ACTIVE",
      }),
    ).toThrow("active academic session already exists")
  })

  it("ignores the current session when counting other ACTIVE sessions", () => {
    const result = resolveStatusTransition({
      current: { id: "a", status: "ACTIVE" },
      allSessions: [{ id: "a", status: "ACTIVE" }, { id: "b", status: "UPCOMING" }],
      requestedStatus: "ACTIVE",
    })
    expect(result.status).toBe("ACTIVE")
  })

  it("keeps the current status when no status is requested", () => {
    const result = resolveStatusTransition({
      current: { id: "a", status: "CLOSED" },
      allSessions: [{ id: "a", status: "CLOSED" }],
    })
    expect(result.status).toBe("CLOSED")
  })
})

describe("createSessionSchema (database-free)", () => {
  it("accepts a valid session and defaults status to undefined (UPCOMING server-side)", () => {
    const parsed = createSessionSchema.parse({
      name: "Academic Year 2026-2027",
      code: "AY2026-27",
      startDate: "2026-04-01",
      endDate: "2027-03-31",
    })
    expect(parsed.name).toBe("Academic Year 2026-2027")
    expect(parsed.status).toBeUndefined()
  })

  it("rejects an end date before the start date", () => {
    const result = createSessionSchema.safeParse({
      name: "S",
      code: "C",
      startDate: "2027-04-01",
      endDate: "2026-03-31",
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-ISO date strings", () => {
    expect(
      createSessionSchema.safeParse({
        name: "S",
        code: "C",
        startDate: "04/01/2026",
        endDate: "2027-03-31",
      }).success,
    ).toBe(false)
  })

  it("requires name and code", () => {
    expect(createSessionSchema.safeParse({ name: "", code: "", startDate: "2026-04-01", endDate: "2027-03-31" }).success).toBe(false)
  })

  it("rejects unknown fields (strict schema)", () => {
    expect(
      createSessionSchema.safeParse({
        name: "S",
        code: "C",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        extra: true,
      }).success,
    ).toBe(false)
  })

  it("accepts any valid status value", () => {
    expect(
      createSessionSchema.safeParse({
        name: "S",
        code: "C",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        status: "CLOSED",
      }).success,
    ).toBe(true)
    expect(
      createSessionSchema.safeParse({
        name: "S",
        code: "C",
        startDate: "2026-04-01",
        endDate: "2027-03-31",
        status: "ARCHIVED",
      }).success,
    ).toBe(false)
  })
})
