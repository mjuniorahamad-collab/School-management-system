import type { Prisma } from "@prisma/client"
import type { UserMembershipDetail, UserMembershipListItem } from "./user.types.js"

interface MembershipRow {
  status: string
  createdAt: Date
  user: { id: string; name: string; email: string; status: string }
  role: { id: string; name: string }
}

export function toUserListItem(row: MembershipRow): UserMembershipListItem {
  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    accountStatus: row.user.status,
    membershipStatus: row.status,
    role: { id: row.role.id, name: row.role.name },
    createdAt: row.createdAt.toISOString(),
  }
}

export function toUserDetail(row: MembershipRow): UserMembershipDetail {
  return toUserListItem(row)
}

export type MembershipInclude = Prisma.TenantMembershipGetPayload<{
  include: { user: true; role: true }
}>
