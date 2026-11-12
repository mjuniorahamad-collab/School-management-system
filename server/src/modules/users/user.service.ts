import { Prisma } from "@prisma/client"
import { hashPassword } from "../../auth/password.js"
import {
  badRequestError,
  forbiddenError,
  notFoundError,
} from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockSchoolAdminMutations } from "../../lib/db-locks.js"
import {
  isAssignableRoleName,
  ROLE_NAMES,
  SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS,
  SUPER_ADMIN_ROLE,
} from "../../permissions/permissions.js"
import {
  resolveEffectivePermissions,
  resolveRolePermissions,
} from "../../services/permission.service.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { revokeActiveMembershipPermissions } from "../membership-permissions/membership-permission.history.js"
import type { AuthUser } from "../../types/auth.js"
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserMembershipInput,
} from "./user.schema.js"
import { toUserDetail, toUserListItem } from "./user.mapper.js"
import type { UserListResult, UserMembershipDetail } from "./user.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function isPlatformSuperAdmin(actor: AuthUser): boolean {
  return actor.roles.includes(SUPER_ADMIN_ROLE)
}

type QualifyingMembership = {
  id: string
  roleId: string
  status: string
  removedAt: Date | null
  role: { name: string }
  user: { status: string }
}

const LAST_ADMIN_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
} as const

async function qualifiesAsSchoolAdmin(
  client: DbClient,
  membership: QualifyingMembership,
): Promise<boolean> {
  if (membership.status !== "ACTIVE") return false
  if (membership.removedAt !== null) return false
  if (membership.user.status !== "ACTIVE") return false
  if (membership.role.name !== ROLE_NAMES.SCHOOL_ADMIN) return false

  const effective = await resolveEffectivePermissions(membership.id, membership.roleId, client)
  return SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS.every((perm) => effective.permissions.has(perm))
}

async function countEffectiveSchoolAdmins(
  client: DbClient,
  schoolId: string,
  excludeMembershipId?: string,
): Promise<number> {
  const memberships = await client.tenantMembership.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      removedAt: null,
      user: { is: { status: "ACTIVE" } },
      ...(excludeMembershipId ? { id: { not: excludeMembershipId } } : {}),
    },
    include: { role: true, user: { select: { status: true } } },
  })
  let count = 0
  for (const membership of memberships) {
    if (await qualifiesAsSchoolAdmin(client, membership)) count += 1
  }
  return count
}

async function assertRoleChangePreservesSchoolAdmin(
  tx: Prisma.TransactionClient,
  membership: QualifyingMembership,
  newRole: { id: string; name: string },
  schoolId: string,
): Promise<void> {
  if (membership.roleId === newRole.id) return
  if (!(await qualifiesAsSchoolAdmin(tx, membership))) return

  let newQualifies = false
  if (newRole.name === ROLE_NAMES.SCHOOL_ADMIN) {
    const newRoleEffective = await resolveRolePermissions(newRole.id, tx)
    newQualifies = SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS.every((perm) =>
      newRoleEffective.permissions.has(perm),
    )
  }
  if (newQualifies) return

  const otherAdmins = await countEffectiveSchoolAdmins(tx, schoolId, membership.id)
  if (otherAdmins < 1) {
    throw forbiddenError("Cannot change role of the last effective School Admin")
  }
}

/**
 * Lists the users who are members of the given tenant, along with the role
 * they hold in that tenant. Always scoped to `schoolId` (server-derived).
 */
export async function listUsers(
  query: ListUsersQuery,
  schoolId: string,
): Promise<UserListResult> {
  const prisma = await requirePrisma()
  const { page, pageSize } = query

  const where: Prisma.TenantMembershipWhereInput = { schoolId, removedAt: null }
  if (query.status) where.status = query.status
  if (query.roleId) where.roleId = query.roleId
  if (query.search) {
    where.user = {
      OR: [
        { name: { contains: query.search, mode: "insensitive" } },
        { email: { contains: query.search, mode: "insensitive" } },
      ],
    }
  }

  const [total, rows] = await prisma.$transaction([
    prisma.tenantMembership.count({ where }),
    prisma.tenantMembership.findMany({
      where,
      include: { user: true, role: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { items: rows.map(toUserListItem), total }
}

/**
 * Returns a single user's membership in the tenant. A user who exists globally
 * but is not a member of this tenant is indistinguishable from an unknown user
 * (404) so tenant membership never leaks via direct-ID lookups.
 */
export async function getUserById(userId: string, schoolId: string): Promise<UserMembershipDetail> {
  const prisma = await requirePrisma()
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, schoolId, removedAt: null },
    include: { user: true, role: true },
  })
  if (!membership) throw notFoundError("This user is not a member of this school")
  return toUserDetail(membership)
}

/**
 * Creates (or finds) a global user by email and grants them a role in the
 * caller's tenant. The tenant is always the server-derived `schoolId`; the body
 * cannot influence which tenant the user is placed into.
 */
export async function createUser(
  input: CreateUserInput,
  schoolId: string,
  actor: AuthUser,
): Promise<UserMembershipDetail> {
  const prisma = await requirePrisma()
  const email = input.email.trim().toLowerCase()

  const user = await prisma.$transaction(async (tx) => {
    await lockSchoolAdminMutations(tx, { schoolId })

    const auditActor = await resolveAuditActor(tx, schoolId, actor)

    const role = await tx.role.findUnique({ where: { id: input.roleId } })
    if (!role) throw badRequestError("Role not found")
    if (!isAssignableRoleName(role.name)) {
      throw forbiddenError("That role cannot be assigned to a tenant user")
    }

    let user = await tx.user.findUnique({ where: { email } })
    const accountExisted = user !== null

    if (!user) {
      if (!input.password) {
        throw badRequestError("A password is required to create a new user account")
      }
      try {
        user = await tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            passwordHash: hashPassword(input.password),
            status: "ACTIVE",
          },
        })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw badRequestError("A user with this email already exists")
        }
        throw error
      }
    }

    const existingMembership = await tx.tenantMembership.findUnique({
      where: { userId_schoolId: { userId: user.id, schoolId } },
      include: { role: true, user: { select: { status: true } } },
    })
    const roleChanged = existingMembership !== null && existingMembership.roleId !== role.id
    const reactivating =
      existingMembership !== null &&
      (existingMembership.status !== "ACTIVE" || existingMembership.removedAt !== null)
    const existingActive =
      existingMembership !== null &&
      existingMembership.status === "ACTIVE" &&
      existingMembership.removedAt === null

    if (existingMembership && roleChanged && existingActive) {
      await assertRoleChangePreservesSchoolAdmin(tx, existingMembership, role, schoolId)
    }

    if (existingMembership && (roleChanged || reactivating)) {
      await revokeActiveMembershipPermissions(
        tx,
        existingMembership,
        auditActor.id,
        roleChanged ? "ROLE_CHANGED" : "MEMBERSHIP_REACTIVATED",
      )
    }

    await tx.tenantMembership.upsert({
      where: { userId_schoolId: { userId: user.id, schoolId } },
      update: {
        roleId: role.id,
        status: "ACTIVE",
        removedAt: null,
        removedById: null,
      },
      create: { userId: user.id, schoolId, roleId: role.id, status: "ACTIVE" },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: "CREATE",
      entityType: "USER",
      entityId: user.id,
      summary: accountExisted
        ? `Added user '${user.name}' to this school with role '${role.name}'`
        : `Created user '${user.name}' with role '${role.name}' in this school`,
      metadata: {
        roleId: role.id,
        roleName: role.name,
        accountExisted,
        reactivated: reactivating,
        roleChanged,
      },
    })

    return user
  }, LAST_ADMIN_TRANSACTION_OPTIONS)

  return getUserById(user.id, schoolId)
}

/**
 * Updates a user's membership within the caller's tenant: changes their role
 * and/or toggles their membership status. Platform-level safeguards:
 *  - Only assignable (non-SUPER_ADMIN) roles may be set.
 *  - A tenant admin cannot manage a platform super admin's membership,
 *    deactivate their own membership, or change membership status without an
 *    assignable-role context.
 */
export async function updateUserMembership(
  userId: string,
  input: UpdateUserMembershipInput,
  schoolId: string,
  actor: AuthUser,
): Promise<UserMembershipDetail> {
  const prisma = await requirePrisma()

  await prisma.$transaction(async (tx) => {
    await lockSchoolAdminMutations(tx, { schoolId })

    const membership = await tx.tenantMembership.findFirst({
      where: { userId, schoolId, removedAt: null },
      include: { role: true, user: true },
    })
    if (!membership) throw notFoundError("This user is not a member of this school")

    const platformSuperAdmin = isPlatformSuperAdmin(actor)
    const isSuperAdminMembership = membership.role.name === SUPER_ADMIN_ROLE

    if (isSuperAdminMembership && !platformSuperAdmin) {
      throw forbiddenError("You cannot manage a platform super admin's membership")
    }

    const data: Prisma.TenantMembershipUncheckedUpdateInput = {}
    let newRole: { id: string; name: string } | null = null

    if (input.roleId !== undefined) {
      const role = await tx.role.findUnique({ where: { id: input.roleId } })
      if (!role) throw badRequestError("Role not found")
      if (!isAssignableRoleName(role.name)) {
        throw forbiddenError("That role cannot be assigned to a tenant user")
      }
      data.roleId = role.id
      newRole = role
    }

    if (input.status !== undefined) {
      if (input.status === "INACTIVE" && userId === actor.id && !platformSuperAdmin) {
        throw badRequestError("You cannot deactivate your own membership")
      }
      data.status = input.status
    }

    if (Object.keys(data).length === 0) {
      throw badRequestError("Nothing to update")
    }

    const roleChanged = input.roleId !== undefined && input.roleId !== membership.roleId
    const statusChanged = input.status !== undefined && input.status !== membership.status
    const targetQualifies =
      (statusChanged || roleChanged) && (await qualifiesAsSchoolAdmin(tx, membership))

    // Effective last-admin protection - must satisfy ALL essential permissions.
    // This runs after the per-school lock and uses only locked, in-transaction
    // state; no count is taken from a pre-lock membership snapshot.
    if (statusChanged && input.status === "INACTIVE" && targetQualifies) {
      const count = await countEffectiveSchoolAdmins(tx, schoolId, membership.id)
      if (count < 1) {
        throw forbiddenError("Cannot deactivate the last effective School Admin")
      }
    }
    if (roleChanged && targetQualifies && newRole) {
      const newRoleEffective = await resolveRolePermissions(newRole.id, tx)
      let newQualifies = newRole.name === ROLE_NAMES.SCHOOL_ADMIN
      if (newQualifies) {
        for (const perm of SCHOOL_ADMIN_ESSENTIAL_PERMISSIONS) {
          if (!newRoleEffective.permissions.has(perm)) {
            newQualifies = false
            break
          }
        }
      }
      if (!newQualifies) {
        const count = await countEffectiveSchoolAdmins(tx, schoolId, membership.id)
        if (count < 1) {
          throw forbiddenError("Cannot change role of the last effective School Admin")
        }
      }
    }

    const auditActor = await resolveAuditActor(tx, schoolId, actor)
    const action = roleChanged ? ("MEMBER_ROLE_CHANGE" as const) : ("MEMBER_STATUS_CHANGE" as const)
    const revocationReason = roleChanged
      ? "ROLE_CHANGED"
      : statusChanged
        ? input.status === "ACTIVE"
          ? "MEMBERSHIP_REACTIVATED"
          : "MEMBERSHIP_DEACTIVATED"
        : null

    let overridesRevoked = 0
    if (revocationReason !== null) {
      overridesRevoked = await revokeActiveMembershipPermissions(
        tx,
        membership,
        auditActor.id,
        revocationReason,
      )
    }

    const updateData: Prisma.TenantMembershipUncheckedUpdateInput = { ...data }
    if (input.status === "ACTIVE") {
      updateData.removedAt = null
      updateData.removedById = null
    }
    await tx.tenantMembership.update({ where: { id: membership.id }, data: updateData })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action,
      entityType: "TENANT_MEMBERSHIP",
      entityId: membership.id,
      summary:
        roleChanged && statusChanged
          ? `Changed ${membership.user.name}'s role to '${newRole?.name}' and status to '${data.status}'`
          : roleChanged
            ? `Changed ${membership.user.name}'s role to '${newRole?.name}'`
            : `Changed ${membership.user.name}'s membership status to '${data.status}'`,
      metadata: {
        roleId: membership.roleId,
        status: membership.status,
        subjectUserId: userId,
        overridesRevoked,
        overridesDeleted: false,
      },
      diff: {
        fields: [
          ...(roleChanged ? [{ field: "roleId", before: membership.roleId, after: data.roleId }] : []),
          ...(statusChanged ? [{ field: "status", before: membership.status, after: data.status }] : []),
        ],
      },
    })
  }, LAST_ADMIN_TRANSACTION_OPTIONS)

  return getUserById(userId, schoolId)
}

/**
 * Removes a user's membership from the caller's tenant. A tenant admin cannot
 * remove their own membership (self-lockout) nor a platform super admin's
 * membership.
 */
export async function removeUserFromTenant(
  userId: string,
  schoolId: string,
  actor: AuthUser,
): Promise<void> {
  const prisma = await requirePrisma()

  await prisma.$transaction(async (tx) => {
    await lockSchoolAdminMutations(tx, { schoolId })

    const membership = await tx.tenantMembership.findFirst({
      where: { userId, schoolId, removedAt: null },
      include: { role: true, user: true },
    })
    if (!membership) throw notFoundError("This user is not a member of this school")

    const platformSuperAdmin = isPlatformSuperAdmin(actor)
    if (membership.role.name === SUPER_ADMIN_ROLE && !platformSuperAdmin) {
      throw forbiddenError("You cannot remove a platform super admin from the tenant")
    }
    if (userId === actor.id && !platformSuperAdmin) {
      throw badRequestError("You cannot remove your own membership")
    }

    // This runs after the per-school lock and uses only locked, in-transaction
    // state; no count is taken from a pre-lock membership snapshot.
    if (await qualifiesAsSchoolAdmin(tx, membership)) {
      const count = await countEffectiveSchoolAdmins(tx, schoolId, membership.id)
      if (count < 1) {
        throw forbiddenError("Cannot remove the last effective School Admin")
      }
    }

    const auditActor = await resolveAuditActor(tx, schoolId, actor)

    const overridesRevoked = await revokeActiveMembershipPermissions(
      tx,
      membership,
      auditActor.id,
      "MEMBERSHIP_REMOVED",
    )
    await tx.tenantMembership.update({
      where: { id: membership.id },
      data: {
        status: "INACTIVE",
        removedAt: new Date(),
        removedById: auditActor.id,
      },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorEmail: auditActor.email,
      actorRole: auditActor.role,
      action: "MEMBER_REMOVED",
      entityType: "TENANT_MEMBERSHIP",
      entityId: membership.id,
      summary: `Removed ${membership.user.name} (role '${membership.role.name}') from this school`,
      metadata: {
        roleId: membership.roleId,
        roleName: membership.role.name,
        status: membership.status,
        subjectUserId: userId,
        overridesRevoked,
        overridesDeleted: false,
        softRemoved: true,
      },
    })
  }, LAST_ADMIN_TRANSACTION_OPTIONS)
}
