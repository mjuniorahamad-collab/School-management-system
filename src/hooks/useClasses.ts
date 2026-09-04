import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { classesService } from "@/services/classesService"
import type { ClassFormPayload, ClassesQuery } from "@/types/classes"

const CLASSES_QUERY_KEY = ["classes"] as const

const QUERY_KEYS = {
  list: (query: ClassesQuery) => ["classes", "list", query] as const,
}

export function useClasses(query: ClassesQuery) {
  return useQuery({
    queryKey: QUERY_KEYS.list(query),
    queryFn: () => classesService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useCreateClass() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ClassFormPayload) => classesService.create(payload),
    onSuccess: (cls) => {
      queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY })
      toast.success("Class created", { description: `Class ${cls.name}` })
    },
    onError: (error: Error) => {
      toast.error("Could not create class", { description: error.message })
    },
  })
}

export function useUpdateClass(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<ClassFormPayload>) => classesService.update(id, payload),
    onSuccess: (cls) => {
      queryClient.invalidateQueries({ queryKey: CLASSES_QUERY_KEY })
      toast.success("Class updated", { description: `Class ${cls.name}` })
    },
    onError: (error: Error) => {
      toast.error("Could not update class", { description: error.message })
    },
  })
}
