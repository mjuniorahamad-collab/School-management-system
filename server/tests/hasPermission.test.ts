import { describe, expect, it } from "vitest"
import { hasPermission } from "../src/auth/hasPermission.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const permissions = new Set(["students:view", "fees:view"])

describe("hasPermission", () => {
  it("returns true when the subject holds the required code", () => {
    expect(hasPermission(["TEACHER"], permissions, ["students:view"])).toBe(true)
  })

  it("returns false when the subject lacks the required code", () => {
    expect(hasPermission(["TEACHER"], permissions, ["students:delete"])).toBe(false)
    expect(hasPermission(["TEACHER"], permissions, ["academic-sessions:view"])).toBe(false)
  })

  it("uses ANY semantics for multiple required codes", () => {
    expect(hasPermission(["TEACHER"], permissions, ["students:delete", "students:view"])).toBe(true)
    expect(hasPermission(["TEACHER"], permissions, ["students:delete", "academic-sessions:view"])).toBe(false)
  })

  it("grants everything to SUPER_ADMIN regardless of grants", () => {
    expect(hasPermission([SUPER_ADMIN_ROLE], new Set(), ["students:delete"])).toBe(true)
  })

  it("returns true when the required list is empty", () => {
    expect(hasPermission(["TEACHER"], new Set(), [])).toBe(true)
  })
})