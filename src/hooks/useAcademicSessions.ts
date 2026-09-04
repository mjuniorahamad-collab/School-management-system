import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { academicSessionsService } from "@/services/academicSessionsService"
import type {
  AcademicSessionFormPayload,
  AcademicSessionsQuery,
} from "@/types/academicSessions"

const ACADEMIC_SESSIONS_QUERY_KEY = ["academic-sessions"] as const

const QUERY_KEYS = {
  list: (query: AcademicSessionsQuery) => ["academic-sessions", "list", query] as const,
}

export function useAcademicSessions(query: AcademicSessionsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.list(query),
    queryFn: () => academicSessionsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateAcademicSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AcademicSessionFormPayload) => academicSessionsService.create(payload),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ACADEMIC_SESSIONS_QUERY_KEY })
      toast.success("Academic session created", { description: `${session.name} (${session.code})` })
    },
    onError: (error: Error) => {
      toast.error("Could not create academic session", { description: error.message })
    },
  })
}

export function useUpdateAcademicSession(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<AcademicSessionFormPayload>) =>
      academicSessionsService.update(id, payload),
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: ACADEMIC_SESSIONS_QUERY_KEY })
      toast.success("Academic session updated", { description: session.name })
    },
    onError: (error: Error) => {
      toast.error("Could not update academic session", { description: error.message })
    },
  })
}
