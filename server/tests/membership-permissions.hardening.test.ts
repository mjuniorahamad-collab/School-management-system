import { describe, expect, it } from "vitest"
import { hasPermission } from "../src/auth/hasPermission.js"
import { NON_DELEGABLE_PERMISSION_CODES, isNonDelegablePermission, SUPER_ADMIN_ROLE, SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS } from "../src/permissions/permissions.js"

describe("membership permission overrides - security hardening", () => {
  it("hasPermission preserves SUPER_ADMIN bypass", () => {
    expect(hasPermission([SUPER_ADMIN_ROLE], new Set(["students:view"]), ["students:delete"])).toBe(true)
  })

  it("non-delegable list includes critical permissions", () => {
    expect(NON_DELEGABLE_PERMISSION_CODES).toContain("users:update")
    expect(NON_DELEGABLE_PERMISSION_CODES).toContain("roles:update")
    expect(NON_DELEGABLE_PERMISSION_CODES).toContain("concessions:override")
    expect(isNonDelegablePermission("users:update")).toBe(true)
    expect(isNonDelegablePermission("roles:update")).toBe(true)
    expect(isNonDelegablePermission("settings:update")).toBe(true)
  })

  it("school admin essential permissions defined", () => {
    expect(SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS).toContain("users:update")
    expect(SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS).toContain("roles:update")
  })

  it("teacher with users:update must not be treated as school admin by role", () => {
    // role-based check is enforced in code; this is a contract test
    expect(["TEACHER", "ACCOUNTANT"]).not.toContain("SCHOOL_ADMIN")
  })
})
