import { describe, expect, it } from "vitest"
import { hasPermission } from "../src/auth/hasPermission.js"
import {
  NON_DELEGABLE_PERMISSION_CODES,
  PERMISSION_CODES,
  ROLE_PERMISSIONS,
  SUPER_ADMIN_ROLE,
  isNonDelegablePermission,
} from "../src/permissions/permissions.js"

describe("membership permission overrides - foundation", () => {
  it("hasPermission preserves SUPER_ADMIN bypass", () => {
    expect(hasPermission([SUPER_ADMIN_ROLE], new Set(["students:view"]), ["students:delete"])).toBe(true)
  })

  it("non-delegable list includes critical permissions", () => {
    expect(NON_DELEGABLE_PERMISSION_CODES).toContain("users:update")
    expect(NON_DELEGABLE_PERMISSION_CODES).toContain("roles:update")
    expect(NON_DELEGABLE_PERMISSION_CODES).toContain("concessions:override")
    expect(isNonDelegablePermission("users:update")).toBe(true)
  })

  it("registers the two narrow management codes", () => {
    expect(PERMISSION_CODES).toContain("membership-permissions:view")
    expect(PERMISSION_CODES).toContain("membership-permissions:grant")
    expect(ROLE_PERMISSIONS.PRINCIPAL).toContain("membership-permissions:view")
    expect(ROLE_PERMISSIONS.PRINCIPAL).toContain("membership-permissions:grant")
    expect(ROLE_PERMISSIONS.SCHOOL_ADMIN).toContain("membership-permissions:view")
    expect(ROLE_PERMISSIONS.SCHOOL_ADMIN).toContain("membership-permissions:grant")
  })

  it("management codes are non-delegable", () => {
    expect(isNonDelegablePermission("membership-permissions:view")).toBe(true)
    expect(isNonDelegablePermission("membership-permissions:grant")).toBe(true)
  })

  it("does not grant PRINCIPAL broad user management", () => {
    expect(ROLE_PERMISSIONS.PRINCIPAL).not.toContain("users:view")
    expect(ROLE_PERMISSIONS.PRINCIPAL).not.toContain("users:update")
  })
})
