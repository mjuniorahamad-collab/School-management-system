export const SUPER_ADMIN_ROLE = "SUPER_ADMIN"

export interface AuthSchool {
  id: string
  name: string
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
}

export interface LoginInput {
  email: string
  password: string
}