import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { teachersService } from "@/services/teachersService"
import type { TeacherFormPayload, TeachersQuery } from "@/types/teachers"

const TEACHERS_QUERY_KEY = ["teachers"] as const

const QUERY_KEYS = {
  list: (query: TeachersQuery) => ["teachers", "list", query] as const,
  detail: (id: string) => ["teachers", "detail", id] as const,
  meta: ["teachers", "meta"] as const,
}

export function useTeachers(query: TeachersQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.list(query),
    queryFn: () => teachersService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useTeacher(id: string | undefined) {
  return useQuery({
    queryKey: QUERY_KEYS.detail(id ?? ""),
    queryFn: () => teachersService.get(id!),
    enabled: Boolean(id),
  })
}

export function useTeacherMeta() {
  return useQuery({
    queryKey: QUERY_KEYS.meta,
    queryFn: () => teachersService.meta(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateTeacher() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: TeacherFormPayload) => teachersService.create(payload),
    onSuccess: (teacher) => {
      queryClient.invalidateQueries({ queryKey: TEACHERS_QUERY_KEY })
      toast.success("Teacher created", {
        description: `${teacher.name} (${teacher.employeeId})`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not create teacher", { description: error.message })
    },
  })
}

export function useUpdateTeacher(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<TeacherFormPayload>) => teachersService.update(id, payload),
    onSuccess: (teacher) => {
      queryClient.invalidateQueries({ queryKey: TEACHERS_QUERY_KEY })
      queryClient.setQueryData(QUERY_KEYS.detail(id), teacher)
      toast.success("Teacher updated", { description: teacher.name })
    },
    onError: (error: Error) => {
      toast.error("Could not update teacher", { description: error.message })
    },
  })
}
