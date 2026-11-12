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

import { grantMembershipPermission } from "../src/modules/membership-permissions/membership-permission.service.js"
import { getPrisma } from "../src/lib/database.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../src/services/permission.service.js"
import {
  recordAudit,
  resolveAuditActor,
} from "../src/modules/audit-logs/audit-log.service.js"

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
  user: { id: "uTarget", status: "ACTIVE" },
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
  const prisma: any = {
    tenantMembership: {
      findFirst: vi.fn(),
    },
    tenantMembershipPermission: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    permission: {
      findUnique: vi.fn().mockResolvedValue({ id: "pNotice" }),
    },
    membershipPermissionHistory: {
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  }
  prisma.$transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(prisma))
  return prisma
}

describe("membership permission grant - service (unit)", () => {
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
    ;(resolveAuditActor as any).mockResolvedValue({
      id: "actor1",
      name: "Actor",
      email: "actor@example.com",
      role: "PRINCIPAL",
    })
    ;(recordAudit as any).mockResolvedValue(undefined)
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view"]),
    })
    mockActorPermissions(["notices:create", "events:create", "membership-permissions:grant"])
  })

  function mockActorPermissions(permissions: string[]) {
    ;(resolveEffectivePermissions as any).mockImplementation(async (membershipId: string) =>
      membershipId === "mActor"
        ? { roles: ["PRINCIPAL"], permissions: new Set(permissions) }
        : { roles: ["TEACHER"], permissions: new Set(["students:view"]) },
    )
  }

  function setTargetRole(name: string) {
    targetMembership = {
      ...targetMembership,
      roleId: `r${name}`,
      role: { id: `r${name}`, name },
    }
  }

  async function expectTargetNotFound() {
    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
      message: "Membership not found",
    })
  }

  it("grants notices:create to a TEACHER as an ALLOW and audits it atomically", async () => {
    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("GRANTED")
    expect(prisma.tenantMembershipPermission.create).toHaveBeenCalledTimes(1)
    expect(prisma.tenantMembershipPermission.create).toHaveBeenCalledWith({
      data: {
        membershipId: "mTarget",
        permissionId: "pNotice",
        effect: "ALLOW",
        grantedById: "actor1",
      },
    })
    expect(recordAudit).toHaveBeenCalledTimes(1)
    const auditInput = (recordAudit as any).mock.calls[0][1]
    expect(auditInput).toMatchObject({
      schoolId: "sch1",
      action: "CREATE",
      entityType: "TENANT_MEMBERSHIP",
      entityId: "mTarget",
      metadata: {
        membershipId: "mTarget",
        permissionCode: "notices:create",
        effect: "ALLOW",
        auditType: "MEMBERSHIP_PERMISSION_GRANT",
      },
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.membershipPermissionHistory.create).toHaveBeenCalledWith({
      data: {
        schoolId: "sch1",
        membershipId: "mTarget",
        targetUserId: "uTarget",
        roleName: "TEACHER",
        permissionCode: "notices:create",
        effect: "ALLOW",
        eventType: "GRANTED",
        actorId: "actor1",
        reason: "GRANTED",
      },
    })
  })

  it("grants events:create to a TEACHER", async () => {
    prisma.permission.findUnique.mockResolvedValue({ id: "pEvent" })
    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "events:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("GRANTED")
    expect(prisma.tenantMembershipPermission.create).toHaveBeenCalledWith({
      data: {
        membershipId: "mTarget",
        permissionId: "pEvent",
        effect: "ALLOW",
        grantedById: "actor1",
      },
    })
  })

  it("scopes the target lookup by tenant and active membership/user statuses", async () => {
    await grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR)

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

  it("never deletes or updates an existing override on a grant", async () => {
    await grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR)

    expect(prisma.tenantMembershipPermission.delete).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.createMany).not.toHaveBeenCalled()
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

    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("rejects a target role outside the V1 policy without revealing the target", async () => {
    setTargetRole("ACCOUNTANT")

    await expectTargetNotFound()
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects a SUPER_ADMIN target without revealing the target", async () => {
    setTargetRole("SUPER_ADMIN")

    await expectTargetNotFound()
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects a known code that is not allow-listed for TEACHER", async () => {
    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "fees:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects an unknown permission code", async () => {
    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "not-a-real-code" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects when the actor does not effectively hold the granted code", async () => {
    mockActorPermissions(["events:create", "membership-permissions:grant"])

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects when the actor lacks membership-permissions:grant", async () => {
    mockActorPermissions(["notices:create", "events:create"])

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects an actor without an active membership in the selected school", async () => {
    const result = grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      { ...ACTOR, school: { id: "sch2", name: "Other" } } as any,
    )

    await expect(result).rejects.toMatchObject({ statusCode: 403 })
    const calls = (prisma.tenantMembership.findFirst as any).mock.calls
    expect(calls).toHaveLength(1)
    expect(calls[0][0].where).not.toHaveProperty("id")
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("rejects self-targeting", async () => {
    actorMembership = { ...ACTOR_MEMBERSHIP, id: "mTarget" }

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("returns ALREADY_INHERITED when the role default already has the code", async () => {
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view", "notices:create"]),
    })

    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("ALREADY_INHERITED")
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("returns ALREADY_GRANTED for an existing ALLOW without writing", async () => {
    prisma.tenantMembershipPermission.findUnique.mockResolvedValue({ effect: "ALLOW" })

    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("ALREADY_GRANTED")
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("reactivates a revoked override and appends a new GRANTED history event", async () => {
    prisma.tenantMembershipPermission.findUnique.mockResolvedValue({
      id: "override1",
      effect: "DENY",
      revokedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("GRANTED")
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.update).toHaveBeenCalledWith({
      where: { id: "override1" },
      data: {
        effect: "ALLOW",
        grantedById: "actor1",
        revokedAt: null,
        revokedById: null,
        revocationReason: null,
      },
    })
    expect(prisma.membershipPermissionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        permissionCode: "notices:create",
        effect: "ALLOW",
        eventType: "GRANTED",
        reason: "REGRANTED",
      }),
    })
    expect(recordAudit).toHaveBeenCalledTimes(1)
  })

  it("does not reactivate a revoked override when the role default covers the code", async () => {
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view", "notices:create"]),
    })
    prisma.tenantMembershipPermission.findUnique.mockResolvedValue({
      id: "override1",
      effect: "DENY",
      revokedAt: new Date("2026-01-01T00:00:00.000Z"),
    })

    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("ALREADY_INHERITED")
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.membershipPermissionHistory.create).not.toHaveBeenCalled()
  })

  it("checks an existing DENY before role-default inheritance", async () => {
    ;(resolveRolePermissions as any).mockResolvedValue({
      roles: ["TEACHER"],
      permissions: new Set(["students:view", "notices:create"]),
    })
    prisma.tenantMembershipPermission.findUnique.mockResolvedValue({ effect: "DENY" })

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 409, code: "PERMISSION_GRANT_CONFLICT" })

    expect(resolveRolePermissions).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.delete).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("conflicts with an existing DENY and leaves the row unchanged", async () => {
    prisma.tenantMembershipPermission.findUnique.mockResolvedValue({ effect: "DENY" })

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 409, code: "PERMISSION_GRANT_CONFLICT" })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.delete).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("returns a clear error when the catalogue row is missing", async () => {
    prisma.permission.findUnique.mockResolvedValue(null)

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 503, code: "SERVICE_UNAVAILABLE" })
    expect(prisma.tenantMembershipPermission.create).not.toHaveBeenCalled()
  })

  it("treats a concurrent duplicate ALLOW as an idempotent no-op", async () => {
    prisma.tenantMembershipPermission.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ effect: "ALLOW" })
    prisma.tenantMembershipPermission.create.mockRejectedValueOnce({ code: "P2002" })

    const result = await grantMembershipPermission(
      "mTarget",
      { permissionCode: "notices:create" },
      ACTOR,
    )

    expect(result.outcome).toBe("ALREADY_GRANTED")
    expect(recordAudit).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
  })

  it("reports a concurrent DENY conflict without rewriting the row", async () => {
    prisma.tenantMembershipPermission.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ effect: "DENY" })
    prisma.tenantMembershipPermission.create.mockRejectedValueOnce({ code: "P2002" })

    await expect(
      grantMembershipPermission("mTarget", { permissionCode: "notices:create" }, ACTOR),
    ).rejects.toMatchObject({ statusCode: 409, code: "PERMISSION_GRANT_CONFLICT" })
    expect(prisma.tenantMembershipPermission.update).not.toHaveBeenCalled()
    expect(prisma.tenantMembershipPermission.deleteMany).not.toHaveBeenCalled()
  })
})
