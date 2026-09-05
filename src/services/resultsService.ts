import { api } from "@/lib/apiClient"
import type {
  FinalizeResult,
  MarksRowInput,
  MarksSaveResult,
  ReopenResult,
  ResultSheet,
  ResultSheetQuery,
} from "@/types/results"

function sheetQueryString(query: ResultSheetQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

// Data seam for the Results module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.
export const resultsService = {
  sheet(examId: string, query: ResultSheetQuery = {}): Promise<ResultSheet> {
    const qs = sheetQueryString(query)
    return api.get<ResultSheet>(`/results/exams/${examId}/sheet${qs ? `?${qs}` : ""}`)
  },
  putSubjectMarks(
    examId: string,
    examSubjectId: string,
    rows: MarksRowInput[],
  ): Promise<MarksSaveResult> {
    return api.put<MarksSaveResult>(`/results/exams/${examId}/subjects/${examSubjectId}/marks`, {
      rows,
    })
  },
  finalize(examId: string): Promise<FinalizeResult> {
    return api.post<FinalizeResult>(`/results/exams/${examId}/finalize`, {})
  },
  reopen(examId: string): Promise<ReopenResult> {
    return api.post<ReopenResult>(`/results/exams/${examId}/reopen`, {})
  },
}