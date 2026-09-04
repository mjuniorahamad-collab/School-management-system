import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { subjectsService } from "@/services/subjectsService"
import type { SubjectFormPayload, SubjectsQuery } from "@/types/subjects"

const SUBJECTS_QUERY_KEY = ["subjects"] as const

const QUERY_KEYS = {
  list: (query: SubjectsQuery) => ["subjects", "list", query] as const,
}

export function useSubjects(query: SubjectsQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.list(query),
    queryFn: () => subjectsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateSubject() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SubjectFormPayload) => subjectsService.create(payload),
    onSuccess: (subject) => {
      queryClient.invalidateQueries({ queryKey: SUBJECTS_QUERY_KEY })
      toast.success("Subject created", {
        description: `${subject.name} (${subject.code})`,
      })
    },
    onError: (error: Error) => {
      toast.error("Could not create subject", { description: error.message })
    },
  })
}

export function useUpdateSubject(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<SubjectFormPayload>) => subjectsService.update(id, payload),
    onSuccess: (subject) => {
      queryClient.invalidateQueries({ queryKey: SUBJECTS_QUERY_KEY })
      toast.success("Subject updated", { description: subject.name })
    },
    onError: (error: Error) => {
      toast.error("Could not update subject", { description: error.message })
    },
  })
}
