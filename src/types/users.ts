// Domain types for the Users & Roles module. Mirrors the backend contract
// (server/src/modules/users/user.types.ts + server/src/modules/roles/role.types.ts).

export const MEMBERSHIP_STATUS_OPTIONS = ["ACTIVE", "INACTIVE"] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUS_OPTIONS)[number]

export const USER_ACCOUNT_STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "SUSPENDED"] as const
export type UserAccountStatus = (typeof USER_ACCOUNT_STATUS_OPTIONS)[number]

export interface UserMembershipListItem {
  id: string
  name: string
  email: string
  accountStatus: string
  membershipStatus: string
  role: { id: string; name: string }
  createdAt: string
}

export type UserMembershipDetail = UserMembershipListItem

export interface UserListResult {
  items: UserMembershipListItem[]
  total: number
}

export interface ListUsersQuery {
  search?: string
  status?: MembershipStatus
  roleId?: string
  page: number
  pageSize: number
}

export interface CreateUserInput {
  name: string
  email: string
  password?: string
  roleId: string
}

export interface UpdateUserMembershipInput {
  roleId?: string
  status?: MembershipStatus
}

export interface RoleListItem {
  id: string
  name: string
  description: string | null
}

export type RoleListResult = RoleListItem[]