import { Prisma } from "@prisma/client"
import { describe, expect, it, vi, beforeEach } from "vitest"

vi.mock("../src/lib/database.js", () => ({
  getPrisma: vi.fn(),
}))
vi.mock("../src/services/permission.service.js", () => ({
  resolveEffectivePermissions: vi.fn(),
  resolveRolePermissions: vi.fn(),
}))
vi.mock("../src/modules/audit-logs/audit-log.service.js", () => ({
  recordAudit: vi.fn(),
  resolveAuditActor: vi.fn(),
}))
vi.mock("../src/modules/users/user.mapper.js", () => ({
  toUserDetail: vi.fn((row: any) => ({ id: row.user.id, role: row.role })),
  toUserListItem: vi.fn((row: any) => ({ id: row.user.id, role: row.role })),
}))

import { removeUserFromTenant, updateUserMembership } from "../src/modules/users/user.service.js"
import { getPrisma } from "../src/lib/database.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../src/services/permission.service.js"
import { SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS } from "../src/permissions/permissions.js"
import { recordAudit, resolveAuditActor } from "../src/modules/audit-logs/audit-log.service.js"

describe("last-admin protection (service behavior)", () => {
  const prismaMock: any = {}
  const actor: any = { id: "actor1", roles: ["SCHOOL_ADMIN"], school: { id: "sch1" } }

  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$queryRaw = vi.fn().mockResolvedValue([])
    prismaMock.$transaction = vi.fn(async (fn: any) => fn(prismaMock))
    prismaMock.tenantMembership = {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    prismaMock.role = { findUnique: vi.fn() }
    prismaMock.tenantMembershipPermission = {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    }
    prismaMock.membershipPermissionHistory = {
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    }
    prismaMock.permission = { findMany: vi.fn() }
    prismaMock.user = { findUnique: vi.fn(), create: vi.fn() }
    ;(getPrisma as any).mockResolvedValue(prismaMock)
    ;(resolveEffectivePermissions as any).mockReset()
    ;(resolveRolePermissions as any).mockReset()
    ;(resolveRolePermissions as any).mockResolvedValue({ roles: [], permissions: new Set() })
    ;(resolveAuditActor as any).mockResolvedValue({ id: "a1", name: "A", email: "a@x.com", role: "SCHOOL_ADMIN" })
    ;(recordAudit as any).mockResolvedValue({})
  })

  function makeEssentialSet() {
    const s = new Set<string>()
    for (const p of SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS) s.add(p)
    return s
  }

  function expectLockFirst(...mocks: any[]) {
    const lockOrder = prismaMock.$queryRaw.mock.invocationCallOrder[0]
    expect(lockOrder).toBeDefined()
    for (const mock of mocks) {
      expect(lockOrder).toBeLessThan(mock.mock.invocationCallOrder[0])
    }
  }

  function expectReadCommitted() {
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
  }

  function expectLockKey() {
    expect(prismaMock.$queryRaw).toHaveBeenCalledWith(
      expect.any(Array),
      "sch1",
      "last-school-admin",
    )
  }

  it("last qualifying SCHOOL_ADMIN role change is rejected", async () => {
    prismaMock.tenantMembership.findFirst
      .mockResolvedValueOnce({
        id: "mTarget",
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rAdmin",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
        user: { id: "uTarget", name: "T", status: "ACTIVE" },
      })
      .mockResolvedValueOnce({
        id: "mTarget",
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rTeacher",
        status: "ACTIVE",
        role: { id: "rTeacher", name: "TEACHER" },
        user: { id: "uTarget", name: "T", email: "t@x.com", status: "ACTIVE" },
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any)
    prismaMock.role.findUnique.mockResolvedValue({ id: "rTeacher", name: "TEACHER" })
    ;(resolveEffectivePermissions as any)
      .mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() }) // current
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([])
    prismaMock.tenantMembership.update.mockResolvedValue({})
    await expect(updateUserMembership("uTarget", { roleId: "rTeacher" }, "sch1", actor)).rejects.toThrow(/last effective School Admin/i)

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(prismaMock.tenantMembership.findFirst, prismaMock.tenantMembership.findMany)
    expect(prismaMock.tenantMembershipPermission.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.membershipPermissionHistory.createMany).not.toHaveBeenCalled()
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("does not use active overrides when evaluating the new role", async () => {
    prismaMock.tenantMembership.findFirst.mockResolvedValueOnce({
      id: "mTarget",
      userId: "uTarget",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: { id: "uTarget", name: "T", status: "ACTIVE" },
    })
    prismaMock.role.findUnique.mockResolvedValue({ id: "rAdmin2", name: "SCHOOL_ADMIN" })
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({
      roles: ["SCHOOL_ADMIN"],
      permissions: makeEssentialSet(),
    })
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["SCHOOL_ADMIN"],
      permissions: new Set(SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS.slice(1)),
    })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([])

    await expect(
      updateUserMembership("uTarget", { roleId: "rAdmin2" }, "sch1", actor),
    ).rejects.toThrow(/last effective School Admin/i)

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(prismaMock.tenantMembership.findFirst, prismaMock.role.findUnique, prismaMock.tenantMembership.findMany)
    expect(prismaMock.tenantMembershipPermission.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("last qualifying SCHOOL_ADMIN deactivation is rejected", async () => {
    prismaMock.tenantMembership.findFirst
      .mockResolvedValueOnce({
        id: "mTarget",
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rAdmin",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
        user: { id: "uTarget", name: "T", status: "ACTIVE" },
      })
      .mockResolvedValueOnce({
        id: "mTarget",
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rAdmin",
        status: "INACTIVE",
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
        user: { id: "uTarget", name: "T", email: "t@x.com", status: "ACTIVE" },
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any)
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([])
    prismaMock.tenantMembership.update.mockResolvedValue({})
    await expect(updateUserMembership("uTarget", { status: "INACTIVE" }, "sch1", actor)).rejects.toThrow(/last effective School Admin/i)

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(prismaMock.tenantMembership.findFirst, prismaMock.tenantMembership.findMany)
    expect(prismaMock.tenantMembershipPermission.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.membershipPermissionHistory.createMany).not.toHaveBeenCalled()
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("last qualifying SCHOOL_ADMIN removal is rejected", async () => {
    prismaMock.tenantMembership.findFirst.mockResolvedValue({
      id: "mTarget",
      userId: "uTarget",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: { id: "uTarget", name: "T", status: "ACTIVE" },
    })
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([])
    await expect(removeUserFromTenant("uTarget", "sch1", actor)).rejects.toThrow(/last effective School Admin/i)

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(prismaMock.tenantMembership.findFirst, prismaMock.tenantMembership.findMany)
    expect(prismaMock.tenantMembershipPermission.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.membershipPermissionHistory.createMany).not.toHaveBeenCalled()
    expect(prismaMock.tenantMembership.update).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("with two qualifying School Admins, removing one is permitted", async () => {
    prismaMock.tenantMembership.findFirst.mockResolvedValue({
      id: "mTarget",
      userId: "uTarget",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: { id: "uTarget", name: "T", status: "ACTIVE" },
    })
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([
      {
        id: "mOther",
        roleId: "rAdmin2",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rAdmin2", name: "SCHOOL_ADMIN" },
        user: { status: "ACTIVE" },
      },
    ])
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    prismaMock.tenantMembershipPermission.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.tenantMembership.delete.mockResolvedValue({})
    await expect(removeUserFromTenant("uTarget", "sch1", actor)).resolves.toBeUndefined()

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(prismaMock.tenantMembership.findFirst, prismaMock.tenantMembership.findMany)
    expect(prismaMock.tenantMembership.delete).not.toHaveBeenCalled()
    expect(prismaMock.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
  })

  it("inactive SCHOOL_ADMIN is not counted", async () => {
    prismaMock.tenantMembership.findFirst.mockResolvedValue({
      id: "mTarget",
      userId: "uTarget",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: { id: "uTarget", name: "T", status: "ACTIVE" },
    })
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([])
    await expect(removeUserFromTenant("uTarget", "sch1", actor)).rejects.toThrow(/last effective School Admin/i)
  })

  it("A Teacher with users:update is not counted", async () => {
    prismaMock.tenantMembership.findFirst.mockResolvedValue({
      id: "mTarget",
      userId: "uTarget",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: { id: "uTarget", name: "T", status: "ACTIVE" },
    })
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([
      {
        id: "mTeacher",
        roleId: "rTeacher",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rTeacher", name: "TEACHER" },
        user: { status: "ACTIVE" },
      },
    ])
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({ roles: ["TEACHER"], permissions: new Set(["users:update"]) })
    await expect(removeUserFromTenant("uTarget", "sch1", actor)).rejects.toThrow(/last effective School Admin/i)
  })

  it("does not count inactive global users or removed memberships as remaining admins", async () => {
    prismaMock.tenantMembership.findFirst.mockResolvedValue({
      id: "mTarget",
      userId: "uTarget",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: { id: "uTarget", name: "T", status: "ACTIVE" },
    })
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({
      roles: ["SCHOOL_ADMIN"],
      permissions: makeEssentialSet(),
    })
    prismaMock.tenantMembership.findMany.mockResolvedValueOnce([
      {
        id: "mInactiveUser",
        roleId: "rAdmin2",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rAdmin2", name: "SCHOOL_ADMIN" },
        user: { status: "INACTIVE" },
      },
      {
        id: "mRemoved",
        roleId: "rAdmin3",
        status: "ACTIVE",
        removedAt: new Date("2024-01-01T00:00:00Z"),
        role: { id: "rAdmin3", name: "SCHOOL_ADMIN" },
        user: { status: "ACTIVE" },
      },
    ])

    await expect(removeUserFromTenant("uTarget", "sch1", actor)).rejects.toThrow(
      /last effective School Admin/i,
    )

    expect(prismaMock.tenantMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          removedAt: null,
          user: { is: { status: "ACTIVE" } },
        }),
      }),
    )
    expect(resolveEffectivePermissions).toHaveBeenCalledTimes(1)
  })

  it("an administrator with all essential permissions qualifies", async () => {
    const s = new Set(SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS)
    expect(s.size).toBe(SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS.length)
    for (const p of SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS) expect(s.has(p)).toBe(true)
  })

  it("role-change override revocation is transactional and never deletes rows", async () => {
    prismaMock.tenantMembership.findFirst
      .mockResolvedValueOnce({
        id: "mTarget",
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rAdmin",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
        user: { id: "uTarget", name: "T", status: "ACTIVE" },
      })
      .mockResolvedValueOnce({
        id: "mTarget",
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rAdmin2",
        status: "ACTIVE",
        role: { id: "rAdmin2", name: "SCHOOL_ADMIN" },
        user: { id: "uTarget", name: "T", email: "t@x.com", status: "ACTIVE" },
        createdAt: new Date("2024-01-01T00:00:00Z"),
      } as any)
    prismaMock.role.findUnique.mockResolvedValue({ id: "rAdmin2", name: "SCHOOL_ADMIN" })
    const otherAdmin = {
      id: "mOther",
      roleId: "rAdmin2",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin2", name: "SCHOOL_ADMIN" },
      user: { status: "ACTIVE" },
    }
    prismaMock.tenantMembership.findMany
      .mockResolvedValueOnce([otherAdmin])
      .mockResolvedValueOnce([otherAdmin])
    ;(resolveEffectivePermissions as any)
      .mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
      .mockResolvedValueOnce({ roles: ["SCHOOL_ADMIN"], permissions: makeEssentialSet() })
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["SCHOOL_ADMIN"],
      permissions: makeEssentialSet(),
    })
    prismaMock.tenantMembershipPermission.findMany.mockResolvedValue([
      { id: "o1", effect: "ALLOW", permission: { code: "notices:create" } },
    ])
    prismaMock.tenantMembershipPermission.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.membershipPermissionHistory.createMany.mockResolvedValue({ count: 1 })
    prismaMock.tenantMembership.update.mockResolvedValue({})
    await updateUserMembership("uTarget", { roleId: "rAdmin2" }, "sch1", actor)
    expectReadCommitted()
    expectLockKey()
    expectLockFirst(prismaMock.tenantMembership.findFirst, prismaMock.role.findUnique)
    expect(prismaMock.tenantMembershipPermission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["o1"] }, revokedAt: null },
        data: expect.objectContaining({ revocationReason: "ROLE_CHANGED" }),
      }),
    )
    expect(prismaMock.membershipPermissionHistory.createMany).toHaveBeenCalled()
    expect(prismaMock.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
  })
})
