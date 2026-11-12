import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))

import { resolveEffectivePermissions } from "../src/services/permission.service.js"
import { getPrisma } from "../src/lib/database.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

describe("membership permission overrides - resolver (unit)", () => {
  const prismaMock: any = {}

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.role = { findUnique: vi.fn() }
    prismaMock.tenantMembershipPermission = { findMany: vi.fn() }
    ;(getPrisma as any).mockResolvedValue(prismaMock)
  })

  it("no overrides → exact role defaults", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [
        { permission: { code: "students:view" } },
        { permission: { code: "attendance:view" } },
      ],
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([])
    const res = await resolveEffectivePermissions("m1", "r1")
    expect(res.roles).toEqual(["TEACHER"])
    expect(res.permissions.has("students:view")).toBe(true)
    expect(res.permissions.has("attendance:view")).toBe(true)
    expect(res.permissions.size).toBe(2)
  })

  it("ALLOW → adds an otherwise missing permission", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [{ permission: { code: "students:view" } }],
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      { effect: "ALLOW", permission: { code: "fees:view" } },
    ])
    const res = await resolveEffectivePermissions("m1", "r1")
    expect(res.permissions.has("students:view")).toBe(true)
    expect(res.permissions.has("fees:view")).toBe(true)
  })

  it("DENY → removes a role permission", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [
        { permission: { code: "students:view" } },
        { permission: { code: "attendance:view" } },
      ],
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      { effect: "DENY", permission: { code: "students:view" } },
    ])
    const res = await resolveEffectivePermissions("m1", "r1")
    expect(res.permissions.has("students:view")).toBe(false)
    expect(res.permissions.has("attendance:view")).toBe(true)
  })

  it("DENY precedence", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [{ permission: { code: "students:view" } }],
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      { effect: "ALLOW", permission: { code: "students:view" } },
      { effect: "DENY", permission: { code: "students:view" } },
    ])
    const res = await resolveEffectivePermissions("m1", "r1")
    expect(res.permissions.has("students:view")).toBe(false)
  })

  it("ignores revoked ALLOW and DENY overrides", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [{ permission: { code: "students:view" } }],
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      {
        effect: "ALLOW",
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
        permission: { code: "fees:view" },
      },
      {
        effect: "DENY",
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
        permission: { code: "students:view" },
      },
    ])
    const res = await resolveEffectivePermissions("m1", "r1")
    expect(res.permissions.has("fees:view")).toBe(false)
    expect(res.permissions.has("students:view")).toBe(true)
    expect(prismaMock.tenantMembershipPermission.findMany).toHaveBeenCalledWith({
      where: { membershipId: "m1", revokedAt: null },
      include: { permission: true },
    })
  })

  it("applies DENY after ALLOW regardless of row order", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [],
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      { effect: "DENY", permission: { code: "fees:view" } },
      { effect: "ALLOW", permission: { code: "fees:view" } },
    ])
    const res = await resolveEffectivePermissions("m1", "r1")
    expect(res.permissions.has("fees:view")).toBe(false)
  })

  it("two school memberships → independent overrides", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "r1",
      name: "TEACHER",
      rolePermissions: [{ permission: { code: "students:view" } }],
    })
    // First membership
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValueOnce([
      { effect: "ALLOW", permission: { code: "fees:view" } },
    ])
    const res1 = await resolveEffectivePermissions("m1", "r1")
    expect(res1.permissions.has("fees:view")).toBe(true)
    // Second membership independent
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValueOnce([
      { effect: "DENY", permission: { code: "students:view" } },
    ])
    const res2 = await resolveEffectivePermissions("m2", "r1")
    expect(res2.permissions.has("students:view")).toBe(false)
    expect(res2.permissions.has("fees:view")).toBe(false)
  })

  it("SUPER_ADMIN behaviour remains unchanged", async () => {
    prismaMock.role.findUnique.mockResolvedValue({
      id: "sr",
      name: SUPER_ADMIN_ROLE,
      rolePermissions: [
        { permission: { code: "students:view" } },
        { permission: { code: "users:update" } },
      ],
    })
    // Even if overrides exist, resolver returns role permissions as-is for SUPER_ADMIN
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      { effect: "DENY", permission: { code: "users:update" } },
    ])
    const res = await resolveEffectivePermissions("m1", "sr")
    expect(res.roles).toEqual([SUPER_ADMIN_ROLE])
    expect(res.permissions.has("users:update")).toBe(true)
    expect(res.permissions.has("students:view")).toBe(true)
  })
})
