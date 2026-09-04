import { api } from "@/lib/apiClient"
import type {
  AcademicSessionDetail,
  AcademicSessionFormPayload,
  AcademicSessionListResult,
  AcademicSessionsQuery,
} from "@/types/academicSessions"

// Data seam for the Academic Sessions module. Every method hits the real REST
// API through the shared apiClient and returns the unwrapped envelope payload.

export function buildAcademicSessionsQueryString(query: AcademicSessionsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  return params.toString()
}

export const academicSessionsService = {
  list(query: AcademicSessionsQuery): Promise<AcademicSessionListResult> {
    return api.get<AcademicSessionListResult>(
      `/academic-sessions?${buildAcademicSessionsQueryString(query)}`,
    )
  },
  get(id: string): Promise<AcademicSessionDetail> {
    return api.get<AcademicSessionDetail>(`/academic-sessions/${id}`)
  },
  create(payload: AcademicSessionFormPayload): Promise<AcademicSessionDetail> {
    return api.post<AcademicSessionDetail>("/academic-sessions", payload)
  },
  update(id: string, payload: Partial<AcademicSessionFormPayload>): Promise<AcademicSessionDetail> {
    return api.patch<AcademicSessionDetail>(`/academic-sessions/${id}`, payload)
  },
}
