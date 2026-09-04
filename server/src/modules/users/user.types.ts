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
