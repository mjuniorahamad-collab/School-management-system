import {
  badRequestError,
  forbiddenError,
  notFoundError,
  permissionGrantConflictError,
  serviceUnavailableError,
} from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import {
  isKnownPermissionCode,
  isNonDelegablePermission,
  SUPER_ADMIN_ROLE,
} from "../../permissions/permissions.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../../services/permission.service.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { recordMembershipPermissionHistory } from "./membership-permission.history.js"
import type { AuthUser } from "../../types/auth.js"
import {
  MEMBERSHIP_PERMISSION_GRANT,
  V1_TARGET_ROLE_GRANTS,
  computeGrantablePermissionCodes,
  getAllowedTargetGrantCodes,
  isV1TargetRole,
} from "./membership-permission.policy.js"
import type { GrantMembershipPermissionInput } from "./membership-permission.schema.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

const V1_TARGET_ROLE_NAMES = Object.keys(V1_TARGET_ROLE_GRANTS)

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

async function ensureActorMembership(prisma: PrismaClient, actor: AuthUser) {
  // The selected-school header must not bypass these checks: the actor must be
  // active in the school it is currently acting in.
  const actorMembership = await prisma.tenantMembership.findFirst({
    where: { userId: actor.id, schoolId: actor.school.id, status: "ACTIVE" },
    include: { role: true },
  })
  if (!actorMembership) {
    throw forbiddenError("You do not have access to that school")
  }
  return actorMembership
}

async function findScopedTargetMembership(
  prisma: PrismaClient,
  membershipId: string,
  schoolId: string,
) {
  // Scope by tenant and active statuses inside the query so a membership in
  // another school, or an inactive membership/user, is indistinguishable from a
  // nonexistent one.
  return prisma.tenantMembership.findFirst({
    where: {
      id: membershipId,
      schoolId,
      status: "ACTIVE",
      user: { is: { status: "ACTIVE" } },
      role: { is: { name: { in: V1_TARGET_ROLE_NAMES } } },
    },
    include: { role: true },
  })
}

type TargetMembership = NonNullable<Awaited<ReturnType<typeof findScopedTargetMembership>>>

function assertEligibleTarget(membership: TargetMembership) {
  // Ineligible targets must fail like a missing target: no existence signal.
  if (
    membership.role.name === SUPER_ADMIN_ROLE ||
    !isV1TargetRole(membership.role.name)
  ) {
    throw notFoundError("Membership not found")
  }
}

async function buildMembershipPermissionView(
  prisma: PrismaClient,
  membership: TargetMembership,
  actorEffective: { permissions: ReadonlySet<string> },
) {
  const [roleDefaults, effective, overrides] = await Promise.all([
    resolveRolePermissions(membership.roleId),
    resolveEffectivePermissions(membership.id, membership.roleId),
    prisma.tenantMembershipPermission.findMany({
      where: { membershipId: membership.id, revokedAt: null },
      include: { permission: { select: { code: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ])

  return {
    membershipId: membership.id,
    schoolId: membership.schoolId,
    role: membership.role.name,
    roleDefaultPermissions: Array.from(roleDefaults.permissions).sort(),
    effectivePermissions: Array.from(effective.permissions).sort(),
    grantablePermissions: computeGrantablePermissionCodes(
      actorEffective.permissions,
      membership.role.name,
    ),
    overrides: overrides
      .filter((override) => override.revokedAt == null)
      .map((override) => ({
        permissionCode: override.permission.code,
        effect: override.effect,
      })),
  }
}

export async function getMembershipPermissions(membershipId: string, actor: AuthUser) {
  const prisma = await requirePrisma()
  const actorMembership = await ensureActorMembership(prisma, actor)
  const membership = await findScopedTargetMembership(prisma, membershipId, actor.school.id)
  if (!membership) throw notFoundError("Membership not found")
  assertEligibleTarget(membership)

  const actorEffective = await resolveEffectivePermissions(
    actorMembership.id,
    actorMembership.roleId,
  )

  return buildMembershipPermissionView(prisma, membership, actorEffective)
}

async function findOverride(
  prisma: PrismaClient,
  membershipId: string,
  permissionId: string,
) {
  return prisma.tenantMembershipPermission.findUnique({
    where: { membershipId_permissionId: { membershipId, permissionId } },
    select: { id: true, effect: true, revokedAt: true },
  })
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  )
}

export type MembershipPermissionGrantOutcome =
  | "GRANTED"
  | "ALREADY_INHERITED"
  | "ALREADY_GRANTED"

/**
 * Adds one membership-scoped ALLOW override. V1 is additive only: new rows are
 * created, and a previously revoked row may be reactivated to ALLOW. Existing
 * active DENY rows are reported and left untouched. Override rows are never
 * deleted.
 */
export async function grantMembershipPermission(
  membershipId: string,
  input: GrantMembershipPermissionInput,
  actor: AuthUser,
) {
  const prisma = await requirePrisma()
  const actorMembership = await ensureActorMembership(prisma, actor)
  const membership = await findScopedTargetMembership(prisma, membershipId, actor.school.id)
  if (!membership) throw notFoundError("Membership not found")
  assertEligibleTarget(membership)

  if (actorMembership.id === membership.id) {
    throw forbiddenError("You cannot grant extra permissions to your own membership")
  }

  const { permissionCode } = input
  if (!isKnownPermissionCode(permissionCode)) {
    throw badRequestError("Unknown or unsupported permission code")
  }
  if (isNonDelegablePermission(permissionCode)) {
    throw forbiddenError("This permission cannot be granted through membership overrides")
  }
  if (!getAllowedTargetGrantCodes(membership.role.name).includes(permissionCode)) {
    throw forbiddenError("This permission is not grantable to this role")
  }

  const actorEffective = await resolveEffectivePermissions(
    actorMembership.id,
    actorMembership.roleId,
  )
  if (!actorEffective.permissions.has(MEMBERSHIP_PERMISSION_GRANT)) {
    throw forbiddenError("You do not have permission to grant membership permissions")
  }
  if (!actorEffective.permissions.has(permissionCode)) {
    throw forbiddenError("You cannot grant permissions you do not effectively possess")
  }

  const permission = await prisma.permission.findUnique({
    where: { code: permissionCode },
    select: { id: true },
  })
  if (!permission) {
    throw serviceUnavailableError(
      "Permission catalogue is not synchronized; an approved catalogue reconciliation is required",
    )
  }

  const existing = await findOverride(prisma, membership.id, permission.id)
  const existingIsRevoked = existing?.revokedAt != null
  if (existing && !existingIsRevoked) {
    if (existing.effect === "DENY") throw permissionGrantConflictError()
    return {
      outcome: "ALREADY_GRANTED" as const,
      ...(await buildMembershipPermissionView(prisma, membership, actorEffective)),
    }
  }

  const roleDefaults = await resolveRolePermissions(membership.roleId)
  if (roleDefaults.permissions.has(permissionCode)) {
    return {
      outcome: "ALREADY_INHERITED" as const,
      ...(await buildMembershipPermissionView(prisma, membership, actorEffective)),
    }
  }

  const auditActor = await resolveAuditActor(prisma, membership.schoolId, actor)

  try {
    await prisma.$transaction(async (tx) => {
      if (existing && existingIsRevoked) {
        await tx.tenantMembershipPermission.update({
          where: { id: existing.id },
          data: {
            effect: "ALLOW",
            grantedById: actor.id,
            revokedAt: null,
            revokedById: null,
            revocationReason: null,
          },
        })
      } else {
        await tx.tenantMembershipPermission.create({
          data: {
            membershipId: membership.id,
            permissionId: permission.id,
            effect: "ALLOW",
            grantedById: actor.id,
          },
        })
      }

      await recordMembershipPermissionHistory(tx, {
        schoolId: membership.schoolId,
        membershipId: membership.id,
        targetUserId: membership.userId,
        roleName: membership.role.name,
        permissionCode,
        effect: "ALLOW",
        eventType: "GRANTED",
        actorId: auditActor.id,
        reason: existingIsRevoked ? "REGRANTED" : "GRANTED",
      })
      await recordAudit(tx, {
        schoolId: membership.schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorEmail: auditActor.email,
        actorRole: auditActor.role,
        action: "CREATE",
        entityType: "TENANT_MEMBERSHIP",
        entityId: membership.id,
        summary: `Granted extra permission ${permissionCode} to membership ${membership.id}`,
        metadata: {
          membershipId: membership.id,
          targetUserId: membership.userId,
          targetRole: membership.role.name,
          permissionCode,
          effect: "ALLOW",
          auditType: "MEMBERSHIP_PERMISSION_GRANT",
          reactivated: existingIsRevoked,
        },
      })
    })
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error
    // A concurrent grant won the unique (membershipId, permissionId) race.
    const raced = await findOverride(prisma, membership.id, permission.id)
    if (!raced) throw error
    if (raced.effect === "DENY" && raced.revokedAt == null) {
      throw permissionGrantConflictError()
    }
    return {
      outcome: "ALREADY_GRANTED" as const,
      ...(await buildMembershipPermissionView(prisma, membership, actorEffective)),
    }
  }

  return {
    outcome: "GRANTED" as const,
    ...(await buildMembershipPermissionView(prisma, membership, actorEffective)),
  }
}
