import { api } from "@/lib/apiClient"
import type { AuthUser, LoginInput } from "@/auth/types"

export interface AuthEnvelope {
  user: AuthUser
}

export async function login(input: LoginInput): Promise<AuthEnvelope> {
  return api.post<AuthEnvelope>("/auth/login", input)
}

export async function fetchMe(): Promise<AuthEnvelope> {
  return api.get<AuthEnvelope>("/auth/me")
}

export async function logout(): Promise<void> {
  await api.post<{ success: boolean }>("/auth/logout", {})
}