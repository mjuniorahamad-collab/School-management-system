import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { resultsService } from "@/services/resultsService"
import type { MarksRowInput, ResultSheetQuery } from "@/types/results"

const RESULTS_GROUP = ["results"] as const

export function useResultSheet(examId: string | null, query: ResultSheetQuery = {}) {
  return useQuery({
    queryKey: ["results", "sheet", examId, query],
    queryFn: () => resultsService.sheet(examId ?? "", query),
    enabled: Boolean(examId),
  })
}

export function usePutSubjectMarks(examId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      examSubjectId,
      rows,
    }: {
      examSubjectId: string
      rows: MarksRowInput[]
    }) => resultsService.putSubjectMarks(examId ?? "", examSubjectId, rows),
    onSuccess: (result, variables) => {
      qc.invalidateQueries({ queryKey: RESULTS_GROUP })
      qc.invalidateQueries({ queryKey: ["exams"] })
      toast.success(`Saved marks`, { description: `${result.saved} student row${result.saved !== 1 ? "s" : ""} updated` })
      void variables
    },
    onError: (e: Error) => toast.error("Could not save marks", { description: e.message }),
  })
}

export function useFinalizeExam(examId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => resultsService.finalize(examId ?? ""),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: RESULTS_GROUP })
      qc.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Examination finalized", {
        description: `${result.ranked} student${result.ranked !== 1 ? "s" : ""} ranked`,
      })
    },
    onError: (e: Error) => toast.error("Could not finalize examination", { description: e.message }),
  })
}

export function useReopenExam(examId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => resultsService.reopen(examId ?? ""),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: RESULTS_GROUP })
      qc.invalidateQueries({ queryKey: ["exams"] })
      toast.success("Examination reopened for corrections")
      void result
    },
    onError: (e: Error) => toast.error("Could not reopen examination", { description: e.message }),
  })
}