import { Prisma } from "@prisma/client"
import { env } from "../../config/env.js"
import { hashPassword } from "../../auth/password.js"
import { generateToken, hashToken } from "../../auth/tokens.js"
import {
  ApiError,
  INTERNAL_ERROR,
  accountDisabledError,
  badRequestError,
  forbiddenError,
  notFoundError,
} from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import { buildPortalLinkNotificationTitle } from "../notifications/notification.rules.js"
import { emitNotifications } from "../notifications/notification.service.js"
import {
  isAdminPortalOperator,
  profileExists,
  userBelongsToSchool,
} from "./portal.service.js"
import type {
  ActivatePortalAccountResult,
  PortalLinkProfileType,
  ProvisionPortalAccountResult,
  RegenerateActivationResult,
} from "./portal.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const client = await getPrisma()
  if (!client) throw new Error("Database is not configured")
  return client
}

/** Distinct code for expired/used/forged activation links. */
export const INVALID_OR_EXPIRED_LINK = "INVALID_OR_EXPIRED_LINK"

function invalidOrExpiredLinkError(): ApiError {
  return new ApiError(
    400,
    INVALID_OR_EXPIRED_LINK,
    "This activation link is invalid or has expired. Ask the school to send a new one.",
  )
}

function requirePortalOperator(auth: AuthUser): void {
  if (!isAdminPortalOperator(auth)) {
    throw forbiddenError("You do not have permission to provision portal accounts")
  }
}

/**
 * Writes the profile→user link plus its audit row and welcome notification in a
 * single transaction. Shared by the brand-new account and existing-user paths so
 * both keep identical audit/notification semantics.
 */
async function linkProfileInTransaction(
  client: DbClient,
  auth: AuthUser,
  profileType: PortalLinkProfileType,
  profileId: string,
  userId: string,
  profileName: string,
): Promise<void> {
  if (profileType === "STUDENT") {
    await client.student.update({ where: { id: profileId }, data: { userId } })
  } else {
    await client.guardian.update({ where: { id: profileId }, data: { userId } })
  }

  const actor = await resolveAuditActor(client, auth.school.id, auth)
  await recordAudit(client, {
    schoolId: auth.school.id,
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    actorEmail: actor.email,
    action: "UPDATE",
    entityType: profileType,
    entityId: profileId,
    summary: `Linked ${profileType.toLowerCase()} profile "${profileName}" to a portal account`,
    metadata: { profileId, profileType, userId },
    diff: { fields: [{ field: "userId", before: null, after: userId }] },
  })

  await emitNotifications(client, {
    schoolId: auth.school.id,
    type: "PORTAL_LINK",
    title: buildPortalLinkNotificationTitle(),
    body: "Your portal account is ready — sign in to view records.",
    linkPath: "/portal",
    sourceEntityType: "USER",
    sourceEntityId: userId,
    recipientUserIds: [userId],
  })
}

export interface ProvisionInput {
  profileType: PortalLinkProfileType
  profileId: string
  parentName: string
  email: string
}

/**
 * Provisions a portal account for a profile.
 *
 * New email → creates a fresh PARENT user (ACTIVE, with an UNGUESSABLE placeholder
 * scrypt hash so pre-activation login fails with INVALID_CREDENTIALS), grants the
 * school's PARENT membership, links the profile, and mints a one-time hashed
 * activation token. The RAW token is returned exactly once to the admin.
 *
 * Existing email → the profile is linked to that user with NO token and NO
 * credential changes (they already sign in as themselves). Requested behaviour.
 */
export async function provisionPortalAccount(
  auth: AuthUser,
  input: ProvisionInput,
): Promise<ProvisionPortalAccountResult> {
  requirePortalOperator(auth)
  const prisma = await requirePrisma()

  const profile = await profileExists(prisma, auth.school.id, input.profileType, input.profileId)
  if (!profile.exists) throw notFoundError("Profile not found")
  if (profile.userId) throw badRequestError("This profile is already linked to a portal account")

  const email = input.email.trim().toLowerCase()
  const existingUser = await prisma.user.findUnique({ where: { email } })

  if (existingUser) {
    if (!(await userBelongsToSchool(prisma, auth.school.id, existingUser.id))) {
      throw badRequestError("That email belongs to a user outside this school")
    }
    await prisma.$transaction((tx) =>
      linkProfileInTransaction(
        tx,
        auth,
        input.profileType,
        input.profileId,
        existingUser.id,
        profile.name,
      ),
    )
    return {
      provisioned: false,
      linkedToExisting: true,
      token: null,
      expiresAt: null,
      userId: existingUser.id,
      profileType: input.profileType,
      profileId: input.profileId,
      profileName: profile.name,
      userName: existingUser.name,
      userEmail: existingUser.email,
    }
  }

  const expiresAt = new Date(Date.now() + env.portalActivation.ttlMs)
  // Shown once to the admin; never stored, logged, or audited.
  const rawToken = generateToken()
  const placeholderHash = hashPassword(generateToken())

  const createdUser = await prisma.$transaction(async (tx) => {
    const parentRole = await tx.role.findUnique({ where: { name: "PARENT" } })
    if (!parentRole) {
      throw new ApiError(500, INTERNAL_ERROR, "PARENT role is not configured")
    }

    const user = await tx.user.create({
      data: {
        name: input.parentName.trim(),
        email,
        passwordHash: placeholderHash,
        status: "ACTIVE",
      },
      select: { id: true, name: true, email: true },
    })
    await tx.userRole.create({ data: { userId: user.id, roleId: parentRole.id } })
    await tx.tenantMembership.create({
      data: { userId: user.id, schoolId: auth.school.id, roleId: parentRole.id, status: "ACTIVE" },
    })
    await tx.portalActivationToken.create({
      data: {
        tokenHash: hashToken(rawToken),
        schoolId: auth.school.id,
        userId: user.id,
        purpose: "PARENT",
        expiresAt,
      },
    })
    await linkProfileInTransaction(
      tx,
      auth,
      input.profileType,
      input.profileId,
      user.id,
      profile.name,
    )

    const actor = await resolveAuditActor(tx, auth.school.id, auth)
    await recordAudit(tx, {
      schoolId: auth.school.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: "CREATE",
      entityType: profile.entityType,
      entityId: input.profileId,
      summary: `Provisioned portal account "${input.parentName.trim()}" for ${input.profileType.toLowerCase()} profile "${profile.name}"`,
      metadata: {
        profileId: input.profileId,
        profileType: input.profileType,
        userId: user.id,
        email,
        activationExpiresAt: expiresAt.toISOString(),
      },
    })
    return user
  })

  return {
    provisioned: true,
    linkedToExisting: false,
    token: rawToken,
    expiresAt: expiresAt.toISOString(),
    userId: createdUser.id,
    profileType: input.profileType,
    profileId: input.profileId,
    profileName: profile.name,
    userName: createdUser.name,
    userEmail: createdUser.email,
  }
}

/**
 * Issues a fresh activation token for an already-provisioned portal account,
 * revoking every outstanding token for that user+school first (a regenerate
 * replaces the previous link — the old one stops working).
 */
export async function regenerateActivation(
  auth: AuthUser,
  userId: string,
): Promise<RegenerateActivationResult> {
  requirePortalOperator(auth)
  const prisma = await requirePrisma()

  if (!(await userBelongsToSchool(prisma, auth.school.id, userId))) {
    throw notFoundError("User not found")
  }
  const [studentLinks, guardianLinks] = await Promise.all([
    prisma.student.count({ where: { schoolId: auth.school.id, userId } }),
    prisma.guardian.count({ where: { schoolId: auth.school.id, userId } }),
  ])
  if (studentLinks + guardianLinks === 0) {
    throw badRequestError("This account has no portal profiles linked in this school")
  }

  const expiresAt = new Date(Date.now() + env.portalActivation.ttlMs)
  const rawToken = generateToken()

  await prisma.$transaction(async (tx) => {
    await tx.portalActivationToken.updateMany({
      where: { schoolId: auth.school.id, userId, usedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    await tx.portalActivationToken.create({
      data: {
        tokenHash: hashToken(rawToken),
        schoolId: auth.school.id,
        userId,
        purpose: "PARENT",
        expiresAt,
      },
    })
    const actor = await resolveAuditActor(tx, auth.school.id, auth)
    await recordAudit(tx, {
      schoolId: auth.school.id,
      actorId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: "UPDATE",
      entityType: "USER",
      entityId: userId,
      summary: "Regenerated portal activation link",
      metadata: { userId, activationExpiresAt: expiresAt.toISOString() },
    })
  })

  return { token: rawToken, expiresAt: expiresAt.toISOString(), userId }
}

/**
 * Public, one-time credential-set for a freshly provisioned portal account.
 * Validating the token is a hash lookup; the password replaces the placeholder
 * hash. The admin-generated raw token never enters this path's storage.
 */
export async function activatePortalAccount(
  token: string,
  newPassword: string,
): Promise<ActivatePortalAccountResult> {
  const prisma = await requirePrisma()

  const tokenRow = await prisma.portalActivationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })
  if (
    !tokenRow ||
    tokenRow.usedAt ||
    tokenRow.revokedAt ||
    tokenRow.expiresAt.getTime() <= Date.now()
  ) {
    throw invalidOrExpiredLinkError()
  }

  const user = await prisma.user.findUnique({
    where: { id: tokenRow.userId },
    select: { id: true, name: true, email: true, status: true },
  })
  if (!user || user.status !== "ACTIVE") throw accountDisabledError()

  // The parent must still actually belong to this school (they may have been
  // unlinked/deprovisioned after the link was issued).
  const membership = await prisma.tenantMembership.findFirst({
    where: { userId: tokenRow.userId, schoolId: tokenRow.schoolId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  })
  if (!membership) throw invalidOrExpiredLinkError()

  const passwordHash = hashPassword(newPassword)

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } })
    await tx.portalActivationToken.update({
      where: { id: tokenRow.id },
      data: { usedAt: new Date() },
    })
    await recordAudit(tx, {
      schoolId: tokenRow.schoolId,
      actorId: user.id,
      actorName: user.name,
      actorRole: membership.role.name,
      actorEmail: user.email,
      action: "UPDATE",
      entityType: "USER",
      entityId: user.id,
      summary: "Portal password set via activation link",
      metadata: { tokenId: tokenRow.id },
    })
  })

  return {
    activated: true,
    autoSignedIn: true,
    user: { id: user.id, name: user.name, email: user.email },
  }
}