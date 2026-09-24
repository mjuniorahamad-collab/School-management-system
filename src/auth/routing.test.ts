import { describe, expect, it } from "vitest"
import { defaultLandingPath, isPortalOnlyUser } from "./routing"
import type { AuthUser } from "./types"

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u-1",
    name: "Test User",
    email: "user@example.com",
    status: "ACTIVE",
    school: { id: "s-1", name: "Test School" },
    roles: ["PARENT"],
    permissions: ["portal:view"],
    memberships: [],
    ...overrides,
  }
}

describe("isPortalOnlyUser", () => {
  it("treats a null/undefined user as not portal-only", () => {
    expect(isPortalOnlyUser(null)).toBe(false)
    expect(isPortalOnlyUser(undefined)).toBe(false)
  })

  it("returns true for a parent (portal:view, no dashboard:view)", () => {
    const parent = makeUser({ roles: ["PARENT"], permissions: ["portal:view", "notifications:view"] })
    expect(isPortalOnlyUser(parent)).toBe(true)
  })

  it("returns true for a student", () => {
    const student = makeUser({ roles: ["STUDENT"], permissions: ["portal:view", "notifications:view"] })
    expect(isPortalOnlyUser(student)).toBe(true)
  })

  it("returns false for admin/staff roles that hold dashboard:view", () => {
    const admin = makeUser({ roles: ["SCHOOL_ADMIN"], permissions: ["dashboard:view", "settings:view"] })
    const teacher = makeUser({ roles: ["TEACHER"], permissions: ["dashboard:view", "students:view"] })
    expect(isPortalOnlyUser(admin)).toBe(false)
    expect(isPortalOnlyUser(teacher)).toBe(false)
  })

  it("returns false for SUPER_ADMIN (role bypass)", () => {
    const superAdmin = makeUser({ roles: ["SUPER_ADMIN"], permissions: [] })
    expect(isPortalOnlyUser(superAdmin)).toBe(false)
  })
})

describe("defaultLandingPath", () => {
  it("sends portal-only users to /portal", () => {
    const parent = makeUser({ roles: ["PARENT"], permissions: ["portal:view"] })
    expect(defaultLandingPath(parent)).toBe("/portal")
  })

  it("sends dashboard users to /dashboard", () => {
    const admin = makeUser({ roles: ["SCHOOL_ADMIN"], permissions: ["dashboard:view"] })
    expect(defaultLandingPath(admin)).toBe("/dashboard")
    expect(defaultLandingPath(null)).toBe("/dashboard")
  })
})