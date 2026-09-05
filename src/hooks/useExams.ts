import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { examsService } from "@/services/examsService"
import type { ExamFormPayload, ExamsQuery, ExamSubjectInput } from "@/types/exams"

const EXAMS_GROUP = ["exams"] as const

export function useExamList(query: ExamsQuery) {
  return useQuery({
    queryKey: ["exams", "list", query],
    queryFn: () => examsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useExamDetail(id: string | null) {
  return useQuery({
    queryKey: ["exams", "detail", id],
    queryFn: () => examsService.get(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useExamContext() {
  return useQuery({
    queryKey: ["exams", "context"],
    queryFn: () => examsService.context(),
    staleTime: 5 * 60_000,
  })
}

export function useCreateExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ExamFormPayload) => examsService.create(payload),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: EXAMS_GROUP })
      toast.success("Examination created", { description: exam.name })
    },
    onError: (e: Error) => toast.error("Could not create examination", { description: e.message }),
  })
}

export function useUpdateExam(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Partial<ExamFormPayload>) => examsService.update(id, payload),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: EXAMS_GROUP })
      toast.success("Examination updated", { description: exam.name })
    },
    onError: (e: Error) => toast.error("Could not update examination", { description: e.message }),
  })
}

export function useUpdateExamSubjects(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subjects: ExamSubjectInput[]) => examsService.updateSubjects(id, subjects),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: EXAMS_GROUP })
      toast.success("Subjects updated", { description: exam.name })
    },
    onError: (e: Error) => toast.error("Could not update subjects", { description: e.message }),
  })
}

/** Publishes a draft examination (the server stamps `publishedAt`). */
export function usePublishExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => examsService.updateStatus(id, "PUBLISHED"),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: EXAMS_GROUP })
      toast.success("Examination published", { description: exam.name })
    },
    onError: (e: Error) => toast.error("Could not publish examination", { description: e.message }),
  })
}

/** Archives a draft or published examination (terminal state). */
export function useArchiveExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => examsService.updateStatus(id, "ARCHIVED"),
    onSuccess: (exam) => {
      qc.invalidateQueries({ queryKey: EXAMS_GROUP })
      toast.success("Examination archived", { description: exam.name })
    },
    onError: (e: Error) => toast.error("Could not archive examination", { description: e.message }),
  })
}

export function useDeleteExam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => examsService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXAMS_GROUP })
      toast.success("Examination deleted")
    },
    onError: (e: Error) => toast.error("Could not delete examination", { description: e.message }),
  })
}