export const SUPER_ADMIN_ROLE = "SUPER_ADMIN"

export interface AuthSchool {
  id: string
  name: string
}

/** A school the user holds an ACTIVE membership in, and the role held there. */
export interface AuthMembership {
  id: string
  name: string
  role: string
}

export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED"

export interface AuthUser {
  id: string
  school: AuthSchool
  name: string
  email: string
  status: UserStatus
  roles: string[]
  permissions: string[]
  /** Every school this user can access. >1 means the client shows a switcher. */
  memberships: AuthMembership[]
}

export interface LoginInput {
  email: string
  password: string
}