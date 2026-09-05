import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { usersService } from "@/services/usersService"
import type {
  CreateUserInput,
  ListUsersQuery,
  UpdateUserMembershipInput,
  UserMembershipListItem,
} from "@/types/users"

const USERS_GROUP = ["users"] as const

export function useUsers(query: ListUsersQuery) {
  return useQuery({
    queryKey: ["users", query],
    queryFn: () => usersService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: ["users", "detail", id],
    queryFn: () => usersService.get(id as string),
    enabled: id !== null,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateUserInput) => usersService.create(payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: USERS_GROUP })
      toast.success("User added to school", { description: `${user.name} (${user.email})` })
    },
    onError: (e: Error) => toast.error("Could not add user", { description: e.message }),
  })
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateUserMembershipInput) => usersService.update(id, payload),
    onSuccess: (user) => {
      qc.invalidateQueries({ queryKey: USERS_GROUP })
      toast.success("User updated", { description: user.name })
    },
    onError: (e: Error) => toast.error("Could not update user", { description: e.message }),
  })
}

export function useRemoveUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => usersService.remove(id),
    onSuccess: (_result, userId) => {
      qc.invalidateQueries({ queryKey: USERS_GROUP })
      const label = cachedUserName(qc, userId)
      toast.success("User removed from school", { description: label ? `${label} can no longer sign in to this school.` : undefined })
    },
    onError: (e: Error) => toast.error("Could not remove user", { description: e.message }),
  })
}

function cachedUserName(qc: ReturnType<typeof useQueryClient>, userId: string): string | undefined {
  const cache = qc.getQueryCache().findAll({ queryKey: USERS_GROUP })
  for (const entry of cache) {
    const data = entry.state.data as { items?: UserMembershipListItem[] } | undefined
    const match = data?.items?.find((item) => item.id === userId)
    if (match) return match.name
  }
  return undefined
}