import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { homeworkService } from "@/services/homeworkService"
import type { HomeworkFormPayload, HomeworksQuery } from "@/types/homework"

const HOMEWORK_GROUP = ["homework"] as const

export function useHomeworkList(query: HomeworksQuery) {
  return useQuery({
    queryKey: ["homework", "list", query],
    queryFn: () => homeworkService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useHomeworkContext() {
  return useQuery({
    queryKey: ["homework", "context"],
    queryFn: () => homeworkService.context(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: HomeworkFormPayload) => homeworkService.create(payload),
    onSuccess: (homework) => {
      qc.invalidateQueries({ queryKey: HOMEWORK_GROUP })
      toast.success("Homework created", { description: homework.title })
    },
    onError: (e: Error) => toast.error("Could not create homework", { description: e.message }),
  })
}

export function useUpdateHomework(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<HomeworkFormPayload>) => homeworkService.update(id, payload),
    onSuccess: (homework) => {
      qc.invalidateQueries({ queryKey: HOMEWORK_GROUP })
      toast.success("Homework updated", { description: homework.title })
    },
    onError: (e: Error) => toast.error("Could not update homework", { description: e.message }),
  })
}

/** Publishes a draft homework item (the server stamps `publishedAt`). */
export function usePublishHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => homeworkService.update(id, { status: "PUBLISHED" }),
    onSuccess: (homework) => {
      qc.invalidateQueries({ queryKey: HOMEWORK_GROUP })
      toast.success("Homework published", { description: homework.title })
    },
    onError: (e: Error) => toast.error("Could not publish homework", { description: e.message }),
  })
}

export function useDeleteHomework() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => homeworkService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HOMEWORK_GROUP })
      toast.success("Homework deleted")
    },
    onError: (e: Error) => toast.error("Could not delete homework", { description: e.message }),
  })
}