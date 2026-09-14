import { api } from "@/lib/apiClient"
import type {
  ExamContext,
  ExamDetail,
  ExamFormPayload,
  ExamListResult,
  ExamsQuery,
  ExamSubjectInput,
} from "@/types/exams"

export function buildExamsQueryString(query: ExamsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.classId) params.set("classId", query.classId)
  if (query.examTypeId) params.set("examTypeId", query.examTypeId)
  if (query.academicSessionId) params.set("academicSessionId", query.academicSessionId)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

// Data seam for the Examinations module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.
export const examsService = {
  list(query: ExamsQuery): Promise<ExamListResult> {
    return api.get<ExamListResult>(`/exams?${buildExamsQueryString(query)}`)
  },
  get(id: string): Promise<ExamDetail> {
    return api.get<ExamDetail>(`/exams/${id}`)
  },
  context(): Promise<ExamContext> {
    return api.get<ExamContext>("/exams/context")
  },
  create(payload: ExamFormPayload): Promise<ExamDetail> {
    return api.post<ExamDetail>("/exams", payload)
  },
  update(id: string, payload: Partial<ExamFormPayload>): Promise<ExamDetail> {
    return api.patch<ExamDetail>(`/exams/${id}`, payload)
  },
  updateSubjects(id: string, subjects: ExamSubjectInput[]): Promise<ExamDetail> {
    // Backend route is PUT /exams/:id/subjects (full replacement of the list).
    return api.put<ExamDetail>(`/exams/${id}/subjects`, { subjects })
  },
  updateStatus(id: string, status: "PUBLISHED" | "ARCHIVED"): Promise<ExamDetail> {
    return api.patch<ExamDetail>(`/exams/${id}/status`, { status })
  },
  remove(id: string): Promise<{ deleted: true }> {
    return api.delete<{ deleted: true }>(`/exams/${id}`)
  },
}