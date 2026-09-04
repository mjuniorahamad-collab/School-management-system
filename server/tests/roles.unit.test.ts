import { describe, expect, it } from "vitest"
import {
  ASSIGNABLE_ROLE_NAMES,
  ROLE_NAMES,
  SUPER_ADMIN_ROLE,
  isAssignableRoleName,
} from "../src/permissions/permissions.js"

describe("assignable tenant roles (database-free)", () => {
  it("excludes the platform SUPER_ADMIN role", () => {
    expect(ASSIGNABLE_ROLE_NAMES).not.toContain(ROLE_NAMES.SUPER_ADMIN)
    expect(isAssignableRoleName(ROLE_NAMES.SUPER_ADMIN)).toBe(false)
  })

  it("includes the other tenant roles", () => {
    expect(isAssignableRoleName("SCHOOL_ADMIN")).toBe(true)
    expect(isAssignableRoleName("TEACHER")).toBe(true)
    expect(isAssignableRoleName("ACCOUNTANT")).toBe(true)
    expect(isAssignableRoleName("PARENT")).toBe(true)
    expect(isAssignableRoleName("STUDENT")).toBe(true)
  })

  it("is consistent with the ROLE_NAMES catalog", () => {
    const allRoles = Object.values(ROLE_NAMES)
    expect(ASSIGNABLE_ROLE_NAMES.length).toBe(allRoles.length - 1)
    const union = new Set([...ASSIGNABLE_ROLE_NAMES, SUPER_ADMIN_ROLE])
    expect(union.size).toBe(allRoles.length)
  })
})
