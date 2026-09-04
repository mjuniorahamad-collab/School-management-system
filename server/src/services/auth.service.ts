import { env } from "../config/env.js"
import {
  buildAuthUser,
  type AuthUserSource,
  type ResolvedTenant,
} from "../auth/authUser.js"
import { hashPassword, verifyPassword } from "../auth/password.js"
import { generateToken, hashToken } from "../auth/tokens.js"
import {
  ApiError,
  INTERNAL_ERROR,
  accountDisabledError,
  forbiddenError,
  invalidCredentialsError,
  unauthorizedError,
} from "../lib/ApiError.js"
import { getPrisma } from "../lib/database.js"
import {
  resolveRolePermissions,
  resolveUserPermissions,
} from "./permission.service.js"
import type { AuthUser } from "../types/auth.js"

export interface LoginInput {
  email: string
  password: string
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResult {
  user: AuthUser
  tokens: SessionTokens
}

export interface PrincipalContext {
  user: AuthUserSource
  school: ResolvedTenant | null
  roles: string[]
  permissions: Set<string>
  // Ids of the schools the user holds an ACTIVE membership in. Used by clients
  // to present a tenant switcher when it is > 1.
  membershipSchoolIds: string[]
}

// Verified against when the email is unknown so both failure paths burn equal
// time and the response stays uniformly generic (prevents account enumeration).
const DUMMY_PASSWORD_HASH = hashPassword("timing-equalization-sentinel-0e9f")

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new ApiError(500, INTERNAL_ERROR, "Database is not configured")
  return prisma
}

async function createSessionTokens(userId: string): Promise<SessionTokens> {
  const prisma = await requirePrisma()
  const accessToken = generateToken()
  const refreshToken = generateToken()
  const now = new Date()

  await prisma.session.create({
    data: {
      userId,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      accessExpiresAt: new Date(now.getTime() + env.session.accessTtlMs),
      refreshExpiresAt: new Date(now.getTime() + env.session.refreshTtlMs),
      lastUsedAt: now,
    },
  })

  return { accessToken, refreshToken }
}

export async function doLogin(input: LoginInput): Promise<LoginResult> {
  const prisma = await requirePrisma()
  const email = input.email.trim().toLowerCase()

  const user = await prisma.user.findUnique({ where: { email }, include: { school: true } })

  const passwordMatches = user
    ? verifyPassword(input.password, user.passwordHash)
    : verifyPassword(input.password, DUMMY_PASSWORD_HASH)

  if (!user || !passwordMatches) {
    throw invalidCredentialsError()
  }

  if (user.status !== "ACTIVE") {
    throw accountDisabledError()
  }

  const tokens = await createSessionTokens(user.id)

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  const principal = await resolvePrincipalContext(user.id)
  if (!principal.school) {
    // A user with no resolvable tenant cannot be placed in a school.
    throw forbiddenError("Your account is not associated with any school")
  }

  const authUser = buildAuthUser(
    principal.user,
    principal.school,
    principal.roles,
    principal.permissions,
  )

  return { user: authUser, tokens }
}

export async function doLogout(accessToken: string | undefined): Promise<void> {
  if (!accessToken) return
  const prisma = await requirePrisma()
  const accessTokenHash = hashToken(accessToken)

  const session = await prisma.session.findUnique({ where: { accessTokenHash } })
  if (!session || session.revokedAt) return

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })
}

export async function doRefresh(refreshToken: string): Promise<SessionTokens> {
  const prisma = await requirePrisma()
  const refreshTokenHash = hashToken(refreshToken)

  const session = await prisma.session.findUnique({
    where: { refreshTokenHash },
  })

  if (!session || session.revokedAt || session.refreshExpiresAt <= new Date()) {
    throw unauthorizedError("Session has expired. Please sign in again.")
  }

  // Rotation: revoke the old pair and mint a fresh pair atomically.
  const now = new Date()
  const nextAccessToken = generateToken()
  const nextRefreshToken = generateToken()

  await prisma.$transaction([
    prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } }),
    prisma.session.create({
      data: {
        userId: session.userId,
        accessTokenHash: hashToken(nextAccessToken),
        refreshTokenHash: hashToken(nextRefreshToken),
        accessExpiresAt: new Date(now.getTime() + env.session.accessTtlMs),
        refreshExpiresAt: new Date(now.getTime() + env.session.refreshTtlMs),
        lastUsedAt: now,
      },
    }),
  ])

  return { accessToken: nextAccessToken, refreshToken: nextRefreshToken }
}

export interface LoadPrincipalOptions {
  /** Explicit tenant chosen by a multi-school user (from `X-School-Id` header). */
  schoolId?: string
}

/**
 * Loads a user's principal context (identity + roles + permissions), resolving
 * the tenant context from the user's ACTIVE TenantMembership(s).
 *
 * Resolution order:
 *  1. An explicit `schoolId` requires an ACTIVE membership for that school
 *     (rejects otherwise — a 403, never a silent cross-tenant fallback).
 *  2. Otherwise a single ACTIVE membership is auto-selected.
 *  3. Otherwise (zero, or multiple without an explicit selection) we fall back
 *     to the legacy `User.schoolId` + `UserRole` model so pre-membership users
 *     and integration-test fixtures keep working.
 */
export async function loadPrincipalContext(
  userId: string,
  opts: LoadPrincipalOptions = {},
): Promise<PrincipalContext> {
  const prisma = await requirePrisma()

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      schoolId: true,
    },
  })
  if (!user) throw new ApiError(500, INTERNAL_ERROR, "Authenticated user no longer exists")

  const memberships = await prisma.tenantMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { school: { select: { id: true, name: true, status: true } } },
  })

  // 1. Explicit tenant selection (multi-school user).
  if (opts.schoolId) {
    const membership = memberships.find((m) => m.schoolId === opts.schoolId)
    if (!membership) {
      throw forbiddenError("You do not have access to that school")
    }
    const principal = await resolveRolePermissions(membership.roleId)
    return {
      user: toAuthUserSource(user),
      school: tenantFromSchool(membership.school),
      roles: principal.roles,
      permissions: principal.permissions,
      membershipSchoolIds: memberships.map((m) => m.schoolId),
    }
  }

  // 2. Single ACTIVE membership → auto-select it.
  if (memberships.length === 1) {
    const membership = memberships[0]
    const principal = await resolveRolePermissions(membership.roleId)
    return {
      user: toAuthUserSource(user),
      school: tenantFromSchool(membership.school),
      roles: principal.roles,
      permissions: principal.permissions,
      membershipSchoolIds: memberships.map((m) => m.schoolId),
    }
  }

  // 3. Legacy fallback: `User.schoolId` + global `UserRole`.
  const legacySchool = user.schoolId
    ? await prisma.school.findUnique({
        where: { id: user.schoolId },
        select: { id: true, name: true, status: true },
      })
    : null

  const principal = await resolveUserPermissions(user.id)
  return {
    user: toAuthUserSource(user),
    school: legacySchool ? tenantFromSchool(legacySchool) : null,
    roles: principal.roles,
    permissions: principal.permissions,
    membershipSchoolIds: memberships.map((m) => m.schoolId),
  }
}

function toAuthUserSource(user: {
  id: string
  name: string
  email: string
  status: string
}): AuthUserSource {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status as AuthUserSource["status"],
  }
}

function tenantFromSchool(school: {
  id: string
  name: string
  status: string
}): ResolvedTenant {
  return { id: school.id, name: school.name, status: school.status }
}

/**
 * Resolves the principal context for a user. This is the shared entry point
 * used by login and session authentication.
 */
async function resolvePrincipalContext(userId: string): Promise<PrincipalContext> {
  return loadPrincipalContext(userId)
}