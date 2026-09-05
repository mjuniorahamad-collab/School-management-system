import { useQuery } from "@tanstack/react-query"
import { rolesService } from "@/services/rolesService"

export function useRoles() {
  return useQuery({
    queryKey: ["roles"],
    queryFn: () => rolesService.list(),
    staleTime: 5 * 60_000,
  })
}