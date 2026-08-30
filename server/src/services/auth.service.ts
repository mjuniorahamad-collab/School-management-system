import { env } from "../config/env.js"
import { buildAuthUser, type AuthUserSource } from "../auth/authUser.js"
import { hashPassword, verifyPassword } from "../auth/password.js"
import { generateToken, hashToken } from "../auth/tokens.js"
import {
  ApiError,
  INTERNAL_ERROR,
  accountDisabledError,
  invalidCredentialsError,
  unauthorizedError,
} from "../lib/ApiError.js"
import { getPrisma } from "../lib/database.js"
import { resolveUserPermissions } from "./permission.service.js"
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
  roles: string[]
  permissions: Set<string>
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

  const principal = await resolveUserPermissions(user.id)
  const authUser = buildAuthUser(user as AuthUserSource, principal.roles, principal.permissions)

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

/** Loads a user's principal context (identity + roles + permissions). */
export async function loadPrincipalContext(userId: string): Promise<PrincipalContext> {
  const prisma = await requirePrisma()
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { school: true },
  })
  if (!user) throw new ApiError(500, INTERNAL_ERROR, "Authenticated user no longer exists")

  const principal = await resolveUserPermissions(user.id)
  return { user: user as AuthUserSource, roles: principal.roles, permissions: principal.permissions }
}