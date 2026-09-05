import { api } from "@/lib/apiClient"
import type { RoleListResult } from "@/types/users"

// Data seam for the Roles catalog. Read-only: role grants are platform-managed.

export const rolesService = {
  list(): Promise<RoleListResult> {
    return api.get<RoleListResult>("/roles")
  },
}