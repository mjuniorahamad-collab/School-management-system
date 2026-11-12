import { beforeEach, describe, expect, it, vi } from "vitest"

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

import {
  createUser,
  removeUserFromTenant,
  updateUserMembership,
} from "../src/modules/users/user.service.js"
import { getPrisma } from "../src/lib/database.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../src/services/permission.service.js"
import { recordAudit, resolveAuditActor } from "../src/modules/audit-logs/audit-log.service.js"

const actor: any = { id: "actor1", roles: ["SCHOOL_ADMIN"], school: { id: "sch1" } }

const ACTIVE_OVERRIDE = {
  id: "o1",
  membershipId: "mTarget",
  effect: "ALLOW",
  permission: { code: "notices:create" },
}

function makeMembership(overrides: Record<string, unknown> = {}) {
  return {
    id: "mTarget",
    userId: "uTarget",
    schoolId: "sch1",
    roleId: "rTeacher",
    status: "ACTIVE",
    removedAt: null,
    removedById: null,
    role: { id: "rTeacher", name: "TEACHER" },
    user: { id: "uTarget", name: "Target", email: "t@x.com", status: "ACTIVE" },
    ...overrides,
  }
}

function createPrismaMock() {
  const prisma: any = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    tenantMembership: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    tenantMembershipPermission: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    membershipPermissionHistory: {
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    role: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    permission: { findMany: vi.fn() },
  }
  prisma.$transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma))
  return prisma
}

describe("membership permission lifecycle preservation (unit)", () => {
  let prisma: ReturnType<typeof createPrismaMock>

  beforeEach(() => {
    vi.clearAllMocks()
    prisma = createPrismaMock()
    ;(getPrisma as any).mockResolvedValue(prisma)
    ;(resolveAuditActor as any).mockResolvedValue({
      id: "a1",
      name: "Actor",
      email: "a@x.com",
      role: "SCHOOL_ADMIN",
    })
    ;(recordAudit as any).mockResolvedValue({})
    ;(resolveEffectivePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view"]),
    })
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view"]),
    })
  })

  function expectRevocation(reason: string) {
    expect(prisma.tenantMembershipPermission.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { membershipId: "mTarget", revokedAt: null },
      }),
    )
    expect(prisma.tenantMembershipPermission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["o1"] }, revokedAt: null },
        data: expect.objectContaining({ revocationReason: reason }),
      }),
    )
    expect(prisma.membershipPermissionHistory.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: "REVOKED",
          reason,
          permissionCode: "notices:create",
        }),
      ],
    })
    expect(prisma.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
  }

  it("deactivation revokes active overrides and keeps the membership row", async () => {
    const membership = makeMembership()
    prisma.tenantMembership.findFirst.mockResolvedValue(membership)
    prisma.tenantMembershipPermission.findMany.mockResolvedValue([ACTIVE_OVERRIDE])
    prisma.tenantMembershipPermission.updateMany.mockResolvedValue({ count: 1 })
    prisma.membershipPermissionHistory.createMany.mockResolvedValue({ count: 1 })

    await updateUserMembership("uTarget", { status: "INACTIVE" }, "sch1", actor)

    expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
      where: { id: "mTarget" },
      data: { status: "INACTIVE" },
    })
    expectRevocation("MEMBERSHIP_DEACTIVATED")
    expect(prisma.tenantMembership.delete).not.toHaveBeenCalled()
  })

  it("reactivation revokes still-active overrides and clears removal metadata", async () => {
    const membership = makeMembership({ status: "INACTIVE" })
    prisma.tenantMembership.findFirst.mockResolvedValue(membership)
    prisma.tenantMembershipPermission.findMany.mockResolvedValue([ACTIVE_OVERRIDE])
    prisma.tenantMembershipPermission.updateMany.mockResolvedValue({ count: 1 })
    prisma.membershipPermissionHistory.createMany.mockResolvedValue({ count: 1 })

    await updateUserMembership("uTarget", { status: "ACTIVE" }, "sch1", actor)

    expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
      where: { id: "mTarget" },
      data: { status: "ACTIVE", removedAt: null, removedById: null },
    })
    expectRevocation("MEMBERSHIP_REACTIVATED")
  })

  it("removal soft-deletes the membership and preserves history", async () => {
    const membership = makeMembership()
    prisma.tenantMembership.findFirst.mockResolvedValue(membership)
    prisma.tenantMembershipPermission.findMany.mockResolvedValue([ACTIVE_OVERRIDE])
    prisma.tenantMembershipPermission.updateMany.mockResolvedValue({ count: 1 })
    prisma.membershipPermissionHistory.createMany.mockResolvedValue({ count: 1 })

    await removeUserFromTenant("uTarget", "sch1", actor)

    expect(prisma.tenantMembership.update).toHaveBeenCalledWith({
      where: { id: "mTarget" },
      data: {
        status: "INACTIVE",
        removedAt: expect.any(Date),
        removedById: "a1",
      },
    })
    expectRevocation("MEMBERSHIP_REMOVED")
    expect(prisma.tenantMembership.delete).not.toHaveBeenCalled()
  })

  it("re-adding a removed member reuses the membership and revokes old overrides", async () => {
    const membership = makeMembership({
      status: "INACTIVE",
      removedAt: new Date("2026-01-01T00:00:00.000Z"),
      removedById: "a1",
    })
    prisma.role.findUnique.mockResolvedValue({ id: "rTeacher", name: "TEACHER" })
    prisma.user.findUnique.mockResolvedValue({
      id: "uTarget",
      name: "Target",
      email: "t@x.com",
      status: "ACTIVE",
    })
    prisma.tenantMembership.findUnique.mockResolvedValue(membership)
    prisma.tenantMembershipPermission.findMany.mockResolvedValue([ACTIVE_OVERRIDE])
    prisma.tenantMembershipPermission.updateMany.mockResolvedValue({ count: 1 })
    prisma.membershipPermissionHistory.createMany.mockResolvedValue({ count: 1 })
    prisma.tenantMembership.findFirst.mockResolvedValue(
      makeMembership({ status: "ACTIVE", removedAt: null, removedById: null }),
    )

    await createUser(
      { email: "t@x.com", name: "Target", roleId: "rTeacher" },
      "sch1",
      actor,
    )

    expect(prisma.tenantMembership.upsert).toHaveBeenCalledWith({
      where: { userId_schoolId: { userId: "uTarget", schoolId: "sch1" } },
      update: {
        roleId: "rTeacher",
        status: "ACTIVE",
        removedAt: null,
        removedById: null,
      },
      create: {
        userId: "uTarget",
        schoolId: "sch1",
        roleId: "rTeacher",
        status: "ACTIVE",
      },
    })
    expectRevocation("MEMBERSHIP_REACTIVATED")
  })
})
