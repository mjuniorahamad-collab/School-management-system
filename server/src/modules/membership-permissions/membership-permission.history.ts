import type { Prisma } from "@prisma/client"

export interface MembershipPermissionHistoryInput {
  schoolId: string
  membershipId: string
  targetUserId: string
  roleName: string
  permissionCode: string
  effect: "ALLOW" | "DENY"
  eventType: "GRANTED" | "REVOKED"
  actorId?: string | null
  reason?: string | null
}

export interface RevocableMembership {
  id: string
  schoolId: string
  userId: string
  role: { name: string }
}

export async function recordMembershipPermissionHistory(
  tx: Prisma.TransactionClient,
  input: MembershipPermissionHistoryInput,
): Promise<void> {
  await tx.membershipPermissionHistory.create({
    data: {
      schoolId: input.schoolId,
      membershipId: input.membershipId,
      targetUserId: input.targetUserId,
      roleName: input.roleName,
      permissionCode: input.permissionCode,
      effect: input.effect,
      eventType: input.eventType,
      actorId: input.actorId ?? null,
      reason: input.reason ?? null,
    },
  })
}

export async function revokeActiveMembershipPermissions(
  tx: Prisma.TransactionClient,
  membership: RevocableMembership,
  actorId: string | null,
  reason: string,
): Promise<number> {
  const active = await tx.tenantMembershipPermission.findMany({
    where: { membershipId: membership.id, revokedAt: null },
    include: { permission: { select: { code: true } } },
    orderBy: { createdAt: "asc" },
  })
  if (active.length === 0) return 0

  const revokedAt = new Date()
  await tx.tenantMembershipPermission.updateMany({
    where: { id: { in: active.map((row) => row.id) }, revokedAt: null },
    data: {
      revokedAt,
      revokedById: actorId,
      revocationReason: reason,
    },
  })
  await tx.membershipPermissionHistory.createMany({
    data: active.map((row) => ({
      schoolId: membership.schoolId,
      membershipId: membership.id,
      targetUserId: membership.userId,
      roleName: membership.role.name,
      permissionCode: row.permission.code,
      effect: row.effect,
      eventType: "REVOKED" as const,
      actorId,
      reason,
    })),
  })

  return active.length
}
