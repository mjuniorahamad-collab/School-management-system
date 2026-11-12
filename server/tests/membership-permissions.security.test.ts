import { describe, expect, it } from "vitest"
import { hasPermission } from "../src/auth/hasPermission.js"
import { NON_DELEGABLE_PERMISSION_CODES, isNonDelegablePermission, SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

describe("membership permission overrides - security", () => {
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

  it("non-delegable permissions cannot be considered delegable", () => {
    for (const code of NON_DELEGABLE_PERMISSION_CODES) {
      expect(isNonDelegablePermission(code)).toBe(true)
    }
  })
})
