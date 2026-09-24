import { createContext } from "react"
import type { AuthMembership, AuthUser, LoginInput } from "@/auth/types"

export const ME_QUERY_KEY = ["auth", "me"] as const

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isError: boolean
  refetch: () => void
  can: (permission: string) => boolean
  signIn: (input: LoginInput) => Promise<AuthUser>
  signOut: () => Promise<void>
  /** Schools the user can switch to. Empty for single-tenant users. */
  memberships: AuthMembership[]
  /** The currently resolved active school (matches `user.school.id`). */
  activeSchoolId: string | null
  /** Clear tenant caches and reload identity in the target school. */
  switchSchool: (schoolId: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)