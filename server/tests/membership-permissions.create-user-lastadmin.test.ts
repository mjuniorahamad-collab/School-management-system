import { Prisma } from "@prisma/client"
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

import { createUser } from "../src/modules/users/user.service.js"
import { getPrisma } from "../src/lib/database.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../src/services/permission.service.js"
import { SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS } from "../src/permissions/permissions.js"
import { recordAudit, resolveAuditActor } from "../src/modules/audit-logs/audit-log.service.js"

const actor: any = { id: "actor1", roles: ["SCHOOL_ADMIN"], school: { id: "sch1" } }

const EXISTING_USER = {
  id: "uTarget",
  name: "T",
  email: "t@x.com",
  status: "ACTIVE",
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
    user: { id: "uTarget", name: "T", email: "t@x.com", status: "ACTIVE" },
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
      update: vi.fn(),
      delete: vi.fn(),
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

function makeEssentialSet() {
  return new Set<string>(SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS)
}

describe("createUser last-admin protection (unit)", () => {
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
    ;(resolveEffectivePermissions as any).mockReset()
    ;(resolveRolePermissions as any).mockReset()
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: [],
      permissions: new Set(),
    })
  })

  function expectLockFirst(...mocks: any[]) {
    const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0]
    expect(lockOrder).toBeDefined()
    for (const mock of mocks) {
      expect(lockOrder).toBeLessThan(mock.mock.invocationCallOrder[0])
    }
  }

  function expectReadCommitted() {
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    )
  }

  function expectLockKey() {
    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.any(Array),
      "sch1",
      "last-school-admin",
    )
  }

  it("rejects demoting the last qualifying active SCHOOL_ADMIN before writes", async () => {
    prisma.user.findUnique.mockResolvedValue(EXISTING_USER)
    prisma.role.findUnique.mockResolvedValue({ id: "rTeacher", name: "TEACHER" })
    prisma.tenantMembership.findUnique.mockResolvedValue(
      makeMembership({
        roleId: "rAdmin",
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      }),
    )
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({
      roles: ["SCHOOL_ADMIN"],
      permissions: makeEssentialSet(),
    })
    prisma.tenantMembership.findMany.mockResolvedValueOnce([])

    await expect(
      createUser({ email: "t@x.com", name: "T", roleId: "rTeacher" }, "sch1", actor),
    ).rejects.toThrow(/last effective School Admin/i)

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(
      prisma.role.findUnique,
      prisma.user.findUnique,
      prisma.tenantMembership.findUnique,
      prisma.tenantMembership.findMany,
    )
    expect(prisma.tenantMembershipPermission.findMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.updateMany).not.toHaveBeenCalled()
    expect(prisma.membershipPermissionHistory.createMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembership.upsert).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("allows the role change when another qualifying SCHOOL_ADMIN remains", async () => {
    prisma.user.findUnique.mockResolvedValue(EXISTING_USER)
    prisma.role.findUnique.mockResolvedValue({ id: "rTeacher", name: "TEACHER" })
    prisma.tenantMembership.findUnique.mockResolvedValue(
      makeMembership({
        roleId: "rAdmin",
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      }),
    )
    ;(resolveEffectivePermissions as any)
      .mockResolvedValueOnce({
        roles: ["SCHOOL_ADMIN"],
        permissions: makeEssentialSet(),
      })
      .mockResolvedValueOnce({
        roles: ["SCHOOL_ADMIN"],
        permissions: makeEssentialSet(),
      })
    prisma.tenantMembership.findMany.mockResolvedValueOnce([
      {
        id: "mOther",
        roleId: "rAdmin2",
        status: "ACTIVE",
        removedAt: null,
        role: { id: "rAdmin2", name: "SCHOOL_ADMIN" },
        user: { status: "ACTIVE" },
      },
    ])
    prisma.tenantMembership.findFirst.mockResolvedValue(
      makeMembership({
        roleId: "rTeacher",
        role: { id: "rTeacher", name: "TEACHER" },
      }),
    )

    await expect(
      createUser({ email: "t@x.com", name: "T", roleId: "rTeacher" }, "sch1", actor),
    ).resolves.toMatchObject({ id: "uTarget" })

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(
      prisma.role.findUnique,
      prisma.user.findUnique,
      prisma.tenantMembership.findUnique,
      prisma.tenantMembership.findMany,
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
    expect(recordAudit).toHaveBeenCalledTimes(1)
  })

  it("does not block a role change that keeps qualifying SCHOOL_ADMIN status", async () => {
    prisma.user.findUnique.mockResolvedValue(EXISTING_USER)
    prisma.role.findUnique.mockResolvedValue({ id: "rAdmin2", name: "SCHOOL_ADMIN" })
    prisma.tenantMembership.findUnique.mockResolvedValue(
      makeMembership({
        roleId: "rAdmin",
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      }),
    )
    ;(resolveEffectivePermissions as any).mockResolvedValueOnce({
      roles: ["SCHOOL_ADMIN"],
      permissions: makeEssentialSet(),
    })
    ;(resolveRolePermissions as any).mockResolvedValueOnce({
      roles: ["SCHOOL_ADMIN"],
      permissions: makeEssentialSet(),
    })
    prisma.tenantMembership.findFirst.mockResolvedValue(
      makeMembership({
        roleId: "rAdmin2",
        role: { id: "rAdmin2", name: "SCHOOL_ADMIN" },
      }),
    )

    await expect(
      createUser({ email: "t@x.com", name: "T", roleId: "rAdmin2" }, "sch1", actor),
    ).resolves.toMatchObject({ id: "uTarget" })

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(
      prisma.role.findUnique,
      prisma.user.findUnique,
      prisma.tenantMembership.findUnique,
    )
    expect(resolveRolePermissions).toHaveBeenCalledWith("rAdmin2", prisma)
    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembership.upsert).toHaveBeenCalled()
  })

  it("does not block promotion to SCHOOL_ADMIN", async () => {
    prisma.user.findUnique.mockResolvedValue(EXISTING_USER)
    prisma.role.findUnique.mockResolvedValue({ id: "rAdmin", name: "SCHOOL_ADMIN" })
    prisma.tenantMembership.findUnique.mockResolvedValue(makeMembership())
    prisma.tenantMembership.findFirst.mockResolvedValue(
      makeMembership({
        roleId: "rAdmin",
        role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      }),
    )

    await expect(
      createUser({ email: "t@x.com", name: "T", roleId: "rAdmin" }, "sch1", actor),
    ).resolves.toMatchObject({ id: "uTarget" })

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(
      prisma.role.findUnique,
      prisma.user.findUnique,
      prisma.tenantMembership.findUnique,
    )
    expect(resolveEffectivePermissions).not.toHaveBeenCalled()
    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembership.upsert).toHaveBeenCalled()
  })

  it("does not block new membership creation", async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    prisma.user.create.mockResolvedValue({
      id: "uNew",
      name: "New User",
      email: "new@example.com",
      status: "ACTIVE",
    })
    prisma.role.findUnique.mockResolvedValue({ id: "rAdmin", name: "SCHOOL_ADMIN" })
    prisma.tenantMembership.findUnique.mockResolvedValue(null)
    prisma.tenantMembership.findFirst.mockResolvedValue({
      id: "mNew",
      userId: "uNew",
      schoolId: "sch1",
      roleId: "rAdmin",
      status: "ACTIVE",
      removedAt: null,
      role: { id: "rAdmin", name: "SCHOOL_ADMIN" },
      user: {
        id: "uNew",
        name: "New User",
        email: "new@example.com",
        status: "ACTIVE",
      },
    })

    await expect(
      createUser(
        {
          email: "new@example.com",
          name: "New User",
          password: "password123",
          roleId: "rAdmin",
        },
        "sch1",
        actor,
      ),
    ).resolves.toMatchObject({ id: "uNew" })

    expectReadCommitted()
    expectLockKey()
    expectLockFirst(
      prisma.role.findUnique,
      prisma.user.findUnique,
      prisma.user.create,
      prisma.tenantMembership.findUnique,
    )
    expect(resolveEffectivePermissions).not.toHaveBeenCalled()
    expect(prisma.tenantMembership.findMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.findMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembership.upsert).toHaveBeenCalledWith({
      where: { userId_schoolId: { userId: "uNew", schoolId: "sch1" } },
      update: {
        roleId: "rAdmin",
        status: "ACTIVE",
        removedAt: null,
        removedById: null,
      },
      create: {
        userId: "uNew",
        schoolId: "sch1",
        roleId: "rAdmin",
        status: "ACTIVE",
      },
    })
  })
})
