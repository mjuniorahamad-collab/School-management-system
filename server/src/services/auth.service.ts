import { env } from "../config/env.js"
import {
  buildAuthUser,
  type AuthUserSource,
  type ResolvedMembership,
  type ResolvedTenant,
} from "../auth/authUser.js"
import { hashPassword, verifyPassword } from "../auth/password.js"
import { generateToken, hashToken } from "../auth/tokens.js"
import {
  ApiError,
  FORBIDDEN,
  INTERNAL_ERROR,
  accountDisabledError,
  forbiddenError,
  invalidCredentialsError,
  unauthorizedError,
} from "../lib/ApiError.js"
import { getPrisma } from "../lib/database.js"
import { recordAuditAfterCommit } from "../modules/audit-logs/audit-log.service.js"
import { resolveRolePermissions } from "./permission.service.js"
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
  // Every school the user holds an ACTIVE membership in (with the role held
  // there). Used by clients to present a tenant switcher when it is > 1.
  memberships: ResolvedMembership[]
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

export async function createSessionTokens(userId: string): Promise<SessionTokens> {
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

export async function doLogin(
  input: LoginInput,
  opts: LoadPrincipalOptions = {},
): Promise<LoginResult> {
  const prisma = await requirePrisma()
  const email = input.email.trim().toLowerCase()

  const user = await prisma.user.findUnique({ where: { email }, include: { school: true } })

  const passwordMatches = user
    ? verifyPassword(input.password, user.passwordHash)
    : verifyPassword(input.password, DUMMY_PASSWORD_HASH)

  if (!user || !passwordMatches) {
    // Best-effort failed-login audit. Records the attempted identity even when
    // the account is unknown (constant-time response limits enumeration risk).
    await recordAuditAfterCommit({
      schoolId: null,
      actorId: user ? user.id : email,
      actorName: email,
      actorRole: "GUEST",
      actorEmail: email,
      action: "FAILED_LOGIN",
      entityType: "AUTH",
      entityId: null,
      summary: "Failed sign-in attempt",
      metadata: { email },
    })
    throw invalidCredentialsError()
  }

  if (user.status !== "ACTIVE") {
    // Rejected sign-in for a known but non-active account.
    await recordAuditAfterCommit({
      schoolId: null,
      actorId: user.id,
      actorName: user.name,
      actorRole: "USER",
      actorEmail: user.email,
      action: "FAILED_LOGIN",
      entityType: "AUTH",
      entityId: null,
      summary: "Sign-in blocked: account is not active",
      metadata: { email },
    })
    throw accountDisabledError()
  }

  const tokens = await createSessionTokens(user.id)

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

  // A returning user's persisted last-used tenant may have been revoked or
  // deleted since their previous session. Login must not lock them out for a
  // stale value — fall back to the deterministic default. (An authenticated
  // request with a forged X-School-Id is still rejected with 403.)
  let principal: PrincipalContext
  try {
    principal = await resolvePrincipalContext(user.id, opts)
  } catch (error) {
    if (opts.schoolId && error instanceof ApiError && error.code === FORBIDDEN) {
      principal = await resolvePrincipalContext(user.id)
    } else {
      throw error
    }
  }

  if (!principal.school) {
    // A user with no resolvable tenant cannot be placed in a school.
    throw forbiddenError("Your account is not associated with any school")
  }

  const authUser = buildAuthUser(
    principal.user,
    principal.school,
    principal.roles,
    principal.permissions,
    principal.memberships,
  )

  // Best-effort sign-in audit — never blocks the login path.
  await recordAuditAfterCommit({
    schoolId: principal.school.id,
    actorId: user.id,
    actorName: principal.user.name,
    actorRole: principal.roles[0] ?? "USER",
    actorEmail: user.email,
    action: "LOGIN",
    entityType: "AUTH",
    entityId: null,
    summary: "User signed in",
  })

  return { user: authUser, tokens }
}

export async function doLogout(accessToken: string | undefined): Promise<void> {
  if (!accessToken) return
  const prisma = await requirePrisma()
  const accessTokenHash = hashToken(accessToken)

  const session = await prisma.session.findUnique({
    where: { accessTokenHash },
    include: { user: { select: { id: true, name: true, email: true } } },
  })
  if (!session || session.revokedAt) return

  await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } })

  if (!session.user) return
  let role = "USER"
  let schoolId: string | null = null
  try {
    const principal = await loadPrincipalContext(session.user.id)
    role = principal.roles[0] ?? "USER"
    schoolId = principal.school?.id ?? null
  } catch {
    // Principal resolution is best-effort for the audit snapshot.
  }
  await recordAuditAfterCommit({
    schoolId,
    actorId: session.user.id,
    actorName: session.user.name,
    actorRole: role,
    actorEmail: session.user.email,
    action: "LOGOUT",
    entityType: "AUTH",
    entityId: null,
    summary: "User signed out",
  })
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
 *  2. Zero ACTIVE memberships → no school context (revocation is enforced;
 *     the legacy column can never grant access on its own).
 *  3. Otherwise a default is selected deterministically: the legacy
 *     `User.schoolId` home hint when it matches an ACTIVE membership, else the
 *     earliest ACTIVE membership. The client persists its last choice and
 *     re-sends it via `X-School-Id`, so this is only the initial fallback.
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

  // `createdAt asc` makes the default-selection fallback deterministic.
  const memberships = await prisma.tenantMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: {
      school: { select: { id: true, name: true, status: true } },
      role: { select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  })

  const membershipList = toMemberships(memberships)

  // 1. Explicit tenant selection (multi-school user, from X-School-Id).
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
      memberships: membershipList,
    }
  }

  // 2. Zero ACTIVE memberships → no school context (revocation is enforced).
  if (memberships.length === 0) {
    return {
      user: toAuthUserSource(user),
      school: null,
      roles: [],
      permissions: new Set(),
      memberships: [],
    }
  }

  // 3. Default selection: legacy home hint if it matches, else the earliest
  //    ACTIVE membership.
  const selected =
    (user.schoolId ? memberships.find((m) => m.schoolId === user.schoolId) : undefined) ??
    memberships[0]
  const principal = await resolveRolePermissions(selected.roleId)
  return {
    user: toAuthUserSource(user),
    school: tenantFromSchool(selected.school),
    roles: principal.roles,
    permissions: principal.permissions,
    memberships: membershipList,
  }
}

interface ActiveMembershipRow {
  schoolId: string
  school: { id: string; name: string; status: string }
  role: { name: string }
}

function toMemberships(rows: ActiveMembershipRow[]): ResolvedMembership[] {
  return rows.map((row) => ({ id: row.schoolId, name: row.school.name, role: row.role.name }))
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
async function resolvePrincipalContext(
  userId: string,
  opts: LoadPrincipalOptions = {},
): Promise<PrincipalContext> {
  return loadPrincipalContext(userId, opts)
}