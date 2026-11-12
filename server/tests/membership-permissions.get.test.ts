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

import { getMembershipPermissions } from "../src/modules/membership-permissions/membership-permission.service.js"
import { getPrisma } from "../src/lib/database.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../src/services/permission.service.js"
import { recordAudit } from "../src/modules/audit-logs/audit-log.service.js"

const ACTOR = {
  id: "actor1",
  name: "Actor",
  email: "actor@example.com",
  school: { id: "sch1", name: "School" },
  roles: ["PRINCIPAL"],
  permissions: [],
  status: "ACTIVE",
  memberships: [],
} as any

const TARGET_MEMBERSHIP = {
  id: "mTarget",
  userId: "uTarget",
  schoolId: "sch1",
  roleId: "rTeacher",
  status: "ACTIVE",
  role: { id: "rTeacher", name: "TEACHER" },
  user: { id: "uTarget", name: "Target", email: "target@example.com", status: "ACTIVE" },
} as any

const ACTOR_MEMBERSHIP = {
  id: "mActor",
  userId: "actor1",
  schoolId: "sch1",
  roleId: "rPrincipal",
  status: "ACTIVE",
  role: { id: "rPrincipal", name: "PRINCIPAL" },
} as any

function createPrismaMock() {
  return {
    tenantMembership: {
      findFirst: vi.fn(),
    },
    tenantMembershipPermission: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  } as any
}

describe("membership permission view - GET (unit)", () => {
  let prisma: ReturnType<typeof createPrismaMock>
  let targetMembership: any
  let actorMembership: any

  beforeEach(() => {
    vi.clearAllMocks()
    targetMembership = { ...TARGET_MEMBERSHIP }
    actorMembership = { ...ACTOR_MEMBERSHIP }
    prisma = createPrismaMock()
    ;(prisma.tenantMembership.findFirst as any).mockImplementation(async ({ where }: any) => {
      if (where.id) {
        if (!targetMembership || where.id !== targetMembership.id) return null
        if (where.schoolId !== targetMembership.schoolId) return null
        if (targetMembership.status !== where.status) return null
        const requiredUserStatus = where.user?.is?.status
        if (requiredUserStatus && targetMembership.user?.status !== requiredUserStatus) {
          return null
        }
        return targetMembership
      }
      if (where.userId === actorMembership.userId) {
        return where.schoolId === actorMembership.schoolId ? actorMembership : null
      }
      return null
    })
    ;(getPrisma as any).mockResolvedValue(prisma)
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view"]),
    })
    ;(resolveEffectivePermissions as any).mockImplementation(async (membershipId: string) =>
      membershipId === "mActor"
        ? {
            roles: ["PRINCIPAL"],
            permissions: new Set([
              "notices:create",
              "events:create",
              "membership-permissions:view",
              "membership-permissions:grant",
            ]),
          }
        : { roles: ["TEACHER"], permissions: new Set(["students:view"]) },
    )
  })

  async function expectTargetNotFound() {
    await expect(getMembershipPermissions("mTarget", ACTOR)).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Membership not found",
    })
  }

  it("returns only permission-shaped data and no personal profile data", async () => {
    prisma.tenantMembershipPermission.findMany.mockResolvedValue([
      {
        permission: { code: "notices:create" },
        effect: "ALLOW",
        grantedBy: { id: "granter", name: "Granter", email: "granter@example.com" },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ])

    const result = await getMembershipPermissions("mTarget", ACTOR)

    expect(result).toMatchObject({
      membershipId: "mTarget",
      schoolId: "sch1",
      role: "TEACHER",
      roleDefaultPermissions: ["students:view"],
      effectivePermissions: ["students:view"],
      grantablePermissions: ["notices:create", "events:create"],
      overrides: [{ permissionCode: "notices:create", effect: "ALLOW" }],
    })
    expect(result.overrides).toHaveLength(1)

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("target@example.com")
    expect(serialized).not.toContain("granter@example.com")
    expect(serialized).not.toContain("grantedBy")

    expect(prisma.tenantMembershipPermission.findMany).toHaveBeenCalledWith({
      where: { membershipId: "mTarget", revokedAt: null },
      include: { permission: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
    })
    expect(recordAudit).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
  })

  it("never reports revoked overrides as active grants", async () => {
    prisma.tenantMembershipPermission.findMany.mockResolvedValue([
      {
        permission: { code: "notices:create" },
        effect: "ALLOW",
        revokedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        permission: { code: "events:create" },
        effect: "ALLOW",
        revokedAt: null,
      },
    ])

    const result = await getMembershipPermissions("mTarget", ACTOR)

    expect(result.overrides).toEqual([
      { permissionCode: "events:create", effect: "ALLOW" },
    ])
  })

  it("scopes the target lookup by tenant and active membership/user statuses", async () => {
    await getMembershipPermissions("mTarget", ACTOR)

    const targetCall = (prisma.tenantMembership.findFirst as any).mock.calls.find(
      (call: any[]) => call[0]?.where?.id === "mTarget",
    )
    expect(targetCall).toBeDefined()
    expect(targetCall[0]).toMatchObject({
      where: {
        id: "mTarget",
        schoolId: "sch1",
        status: "ACTIVE",
        user: { is: { status: "ACTIVE" } },
        role: { is: { name: { in: ["TEACHER"] } } },
      },
      include: { role: true },
    })
    expect(targetCall[0].include).not.toHaveProperty("user")
    expect(targetCall[0].include).not.toHaveProperty("school")
  })

  it("returns the same not-found error for missing, cross-school, inactive, and ineligible targets", async () => {
    targetMembership = null
    await expectTargetNotFound()

    targetMembership = { ...TARGET_MEMBERSHIP, schoolId: "sch2" }
    await expectTargetNotFound()

    targetMembership = { ...TARGET_MEMBERSHIP, status: "INACTIVE" }
    await expectTargetNotFound()

    targetMembership = { ...TARGET_MEMBERSHIP, user: { ...TARGET_MEMBERSHIP.user, status: "INACTIVE" } }
    await expectTargetNotFound()

    targetMembership = {
      ...TARGET_MEMBERSHIP,
      roleId: "rAccountant",
      role: { id: "rAccountant", name: "ACCOUNTANT" },
    }
    await expectTargetNotFound()

    targetMembership = {
      ...TARGET_MEMBERSHIP,
      roleId: "rSuper",
      role: { id: "rSuper", name: "SUPER_ADMIN" },
    }
    await expectTargetNotFound()

    expect(prisma.tenantMembershipPermission.findMany).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("rejects an actor without an active membership in the selected school", async () => {
    await expect(
      getMembershipPermissions("mTarget", {
        ...ACTOR,
        school: { id: "sch2", name: "Other" },
      } as any),
    ).rejects.toMatchObject({ statusCode: 403 })

    const calls = (prisma.tenantMembership.findFirst as any).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0].where).not.toHaveProperty("id")
    expect(prisma.tenantMembershipPermission.findMany).not.toHaveBeenCalled()
  })
})
