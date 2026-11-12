import { describe, expect, it } from "vitest"
import { getAllNavItems } from "@/routes/navigation"
import { canAccessPath, requiredPermissionForPath } from "./routing"
import type { AuthUser } from "./types"

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: "u-1",
    name: "Test User",
    email: "user@example.com",
    status: "ACTIVE",
    school: { id: "s-1", name: "Test School" },
    roles: ["TEACHER"],
    permissions: [],
    memberships: [],
    ...overrides,
  }
}

const DETAIL_PATH_CASES: readonly { path: string; permission: string }[] = [
  { path: "/teachers/teacher-1", permission: "teachers:view" },
  { path: "/teachers/teacher-1/", permission: "teachers:view" },
  { path: "/teachers/teacher-1?tab=profile", permission: "teachers:view" },
  { path: "/students/student-1", permission: "students:view" },
  { path: "/students/student-1/", permission: "students:view" },
  { path: "/portal/links/link-1", permission: "portal:update" },
  { path: "/portal/links/link-1/", permission: "portal:update" },
  { path: "/portal/links/link-1?tab=activity", permission: "portal:update" },
  { path: "/portal/overview", permission: "portal:view" },
  { path: "/report-card-schemes/scheme-1", permission: "report-cards:view" },
  { path: "/fees/structures/structure-1", permission: "fees:view" },
]

const OVERRIDE_CASES: readonly { path: string; permission: string }[] = [
  { path: "/students/new", permission: "students:create" },
  { path: "/students/new/", permission: "students:create" },
  { path: "/students/new?tab=details", permission: "students:create" },
  { path: "/students/student-1/edit", permission: "students:update" },
  { path: "/students/student-1/edit/", permission: "students:update" },
  { path: "/students/student-1/edit?tab=guardian", permission: "students:update" },
]

const PORTAL_PATH_CASES: readonly { path: string; permission: string }[] = [
  { path: "/portal", permission: "portal:view" },
  { path: "/portal/", permission: "portal:view" },
  { path: "/portal/links", permission: "portal:update" },
  { path: "/portal/links/", permission: "portal:update" },
  { path: "/portal/links/account-1", permission: "portal:update" },
]

const UNMAPPED_PATHS = ["/", "/?tab=home", "*", "/*", "/not-a-route", "/teachers-extra", "/portal-extra"]

describe("requiredPermissionForPath", () => {
  it("resolves every nav path, including query strings and trailing slashes", () => {
    for (const item of getAllNavItems()) {
      expect(item.requiredPermission.trim(), `${item.label} must declare a permission`).not.toBe("")
      expect(requiredPermissionForPath(item.path), item.path).toBe(item.requiredPermission)
      expect(requiredPermissionForPath(`${item.path}/?source=test`), item.path).toBe(
        item.requiredPermission,
      )
    }
  })

  it("uses the longest nav prefix for detail pages", () => {
    for (const testCase of DETAIL_PATH_CASES) {
      expect(requiredPermissionForPath(testCase.path), testCase.path).toBe(testCase.permission)
    }
  })

  it("applies the student create and edit overrides before nav prefixes", () => {
    for (const testCase of OVERRIDE_CASES) {
      expect(requiredPermissionForPath(testCase.path), testCase.path).toBe(testCase.permission)
    }

    expect(requiredPermissionForPath("/students/student-1/edits")).toBe("students:view")
  })

  it("resolves portal paths without falling back to a shorter prefix", () => {
    for (const testCase of PORTAL_PATH_CASES) {
      expect(requiredPermissionForPath(testCase.path), testCase.path).toBe(testCase.permission)
    }
  })

  it("returns null for root, catch-all, and unknown paths", () => {
    for (const path of UNMAPPED_PATHS) {
      expect(requiredPermissionForPath(path), path).toBeNull()
    }
  })
})

describe("canAccessPath", () => {
  it("denies anonymous users", () => {
    expect(canAccessPath(null, "/dashboard")).toBe(false)
    expect(canAccessPath(undefined, "/")).toBe(false)
  })

  it("checks the permission resolved from the path", () => {
    const teacher = makeUser({
      roles: ["TEACHER"],
      permissions: ["dashboard:view", "students:view"],
    })

    expect(canAccessPath(teacher, "/dashboard")).toBe(true)
    expect(canAccessPath(teacher, "/students")).toBe(true)
    expect(canAccessPath(teacher, "/students/student-1")).toBe(true)
    expect(canAccessPath(teacher, "/students/new")).toBe(false)
    expect(canAccessPath(teacher, "/students/student-1/edit")).toBe(false)
    expect(canAccessPath(teacher, "/fees/structures")).toBe(false)
  })

  it("distinguishes portal view from portal account management", () => {
    const parent = makeUser({ roles: ["PARENT"], permissions: ["portal:view"] })
    const portalAdmin = makeUser({
      roles: ["PARENT"],
      permissions: ["portal:view", "portal:update"],
    })

    expect(canAccessPath(parent, "/portal")).toBe(true)
    expect(canAccessPath(parent, "/portal/links")).toBe(false)
    expect(canAccessPath(parent, "/portal/links/account-1")).toBe(false)
    expect(canAccessPath(portalAdmin, "/portal/links/account-1")).toBe(true)
  })

  it("allows unmapped root and unknown paths", () => {
    const teacher = makeUser({ permissions: ["students:view"] })

    expect(canAccessPath(teacher, "/")).toBe(true)
    expect(canAccessPath(teacher, "/not-a-route")).toBe(true)
  })

  it("honors the SUPER_ADMIN role bypass", () => {
    const superAdmin = makeUser({ roles: ["SUPER_ADMIN"], permissions: [] })

    expect(canAccessPath(superAdmin, "/audit-logs")).toBe(true)
    expect(canAccessPath(superAdmin, "/students/new")).toBe(true)
  })
})
