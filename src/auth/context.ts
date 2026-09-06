import { createContext } from "react"
import type { AuthUser, LoginInput } from "@/auth/types"

export const ME_QUERY_KEY = ["auth", "me"] as const

export interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isError: boolean
  refetch: () => void
  can: (permission: string) => boolean
  signIn: (input: LoginInput) => Promise<AuthUser>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)