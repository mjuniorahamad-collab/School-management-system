import { api } from "@/lib/apiClient"
import type {
  SubjectDetail,
  SubjectFormPayload,
  SubjectListResult,
  SubjectsQuery,
} from "@/types/subjects"

// Data seam for the Subjects module. Every method hits the real REST API through
// the shared apiClient and returns the unwrapped envelope payload.

export function buildSubjectsQueryString(query: SubjectsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  return params.toString()
}

export const subjectsService = {
  list(query: SubjectsQuery): Promise<SubjectListResult> {
    return api.get<SubjectListResult>(`/subjects?${buildSubjectsQueryString(query)}`)
  },
  get(id: string): Promise<SubjectDetail> {
    return api.get<SubjectDetail>(`/subjects/${id}`)
  },
  create(payload: SubjectFormPayload): Promise<SubjectDetail> {
    return api.post<SubjectDetail>("/subjects", payload)
  },
  update(id: string, payload: Partial<SubjectFormPayload>): Promise<SubjectDetail> {
    return api.patch<SubjectDetail>(`/subjects/${id}`, payload)
  },
}
