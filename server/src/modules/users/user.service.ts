import { Prisma } from "@prisma/client"
import { hashPassword } from "../../auth/password.js"
import {
  badRequestError,
  forbiddenError,
  notFoundError,
} from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { isAssignableRoleName, SUPER_ADMIN_ROLE } from "../../permissions/permissions.js"
import type { AuthUser } from "../../types/auth.js"
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserMembershipInput,
} from "./user.schema.js"
import { toUserDetail, toUserListItem } from "./user.mapper.js"
import type { UserListResult, UserMembershipDetail } from "./user.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function isPlatformSuperAdmin(actor: AuthUser): boolean {
  return actor.roles.includes(SUPER_ADMIN_ROLE)
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

  const where: Prisma.TenantMembershipWhereInput = { schoolId }
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
    where: { userId, schoolId },
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
): Promise<UserMembershipDetail> {
  const prisma = await requirePrisma()

  const role = await prisma.role.findUnique({ where: { id: input.roleId } })
  if (!role) throw badRequestError("Role not found")
  if (!isAssignableRoleName(role.name)) {
    throw forbiddenError("That role cannot be assigned to a tenant user")
  }

  const email = input.email.trim().toLowerCase()
  let user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    if (!input.password) {
      throw badRequestError("A password is required to create a new user account")
    }
    try {
      user = await prisma.user.create({
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

  await prisma.tenantMembership.upsert({
    where: { userId_schoolId: { userId: user.id, schoolId } },
    update: { roleId: role.id, status: "ACTIVE" },
    create: { userId: user.id, schoolId, roleId: role.id, status: "ACTIVE" },
  })

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

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, schoolId },
    include: { role: true },
  })
  if (!membership) throw notFoundError("This user is not a member of this school")

  const platformSuperAdmin = isPlatformSuperAdmin(actor)
  const isSuperAdminMembership = membership.role.name === SUPER_ADMIN_ROLE

  if (isSuperAdminMembership && !platformSuperAdmin) {
    throw forbiddenError("You cannot manage a platform super admin's membership")
  }

  const data: Prisma.TenantMembershipUncheckedUpdateInput = {}

  if (input.roleId !== undefined) {
    const role = await prisma.role.findUnique({ where: { id: input.roleId } })
    if (!role) throw badRequestError("Role not found")
    if (!isAssignableRoleName(role.name)) {
      throw forbiddenError("That role cannot be assigned to a tenant user")
    }
    data.roleId = role.id
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

  await prisma.tenantMembership.update({ where: { id: membership.id }, data })

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

  const membership = await prisma.tenantMembership.findFirst({
    where: { userId, schoolId },
    include: { role: true },
  })
  if (!membership) throw notFoundError("This user is not a member of this school")

  const platformSuperAdmin = isPlatformSuperAdmin(actor)
  if (membership.role.name === SUPER_ADMIN_ROLE && !platformSuperAdmin) {
    throw forbiddenError("You cannot remove a platform super admin from the tenant")
  }
  if (userId === actor.id && !platformSuperAdmin) {
    throw badRequestError("You cannot remove your own membership")
  }

  await prisma.tenantMembership.delete({ where: { id: membership.id } })
}
