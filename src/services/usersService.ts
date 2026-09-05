import { api } from "@/lib/apiClient"
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserMembershipInput,
  UserListResult,
  UserMembershipDetail,
} from "@/types/users"

// Data seam for the Users module. Every method hits the real REST API through
// the shared apiClient and returns the unwrapped envelope payload.

export function buildUsersQueryString(query: ListUsersQuery): string {
  const params = new URLSearchParams()
  params.set("page", String(query.page))
  params.set("pageSize", String(query.pageSize))
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.roleId) params.set("roleId", query.roleId)
  return params.toString()
}

export const usersService = {
  list(query: ListUsersQuery): Promise<UserListResult> {
    return api.get<UserListResult>(`/users?${buildUsersQueryString(query)}`)
  },
  get(id: string): Promise<UserMembershipDetail> {
    return api.get<UserMembershipDetail>(`/users/${id}`)
  },
  create(payload: CreateUserInput): Promise<UserMembershipDetail> {
    return api.post<UserMembershipDetail>("/users", payload)
  },
  update(id: string, payload: UpdateUserMembershipInput): Promise<UserMembershipDetail> {
    return api.patch<UserMembershipDetail>(`/users/${id}`, payload)
  },
  remove(id: string): Promise<void> {
    return api.delete<void>(`/users/${id}`)
  },
}