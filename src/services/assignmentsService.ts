import { api } from "@/lib/apiClient"
import type {
  AssignmentContext,
  AssignmentDetail,
  AssignmentFormPayload,
  AssignmentListResult,
  AssignmentsQuery,
} from "@/types/assignments"

export function buildAssignmentsQueryString(query: AssignmentsQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.classId) params.set("classId", query.classId)
  if (query.subjectId) params.set("subjectId", query.subjectId)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

// Data seam for the Assignments module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.
export const assignmentsService = {
  list(query: AssignmentsQuery): Promise<AssignmentListResult> {
    return api.get<AssignmentListResult>(`/assignments?${buildAssignmentsQueryString(query)}`)
  },
  get(id: string): Promise<AssignmentDetail> {
    return api.get<AssignmentDetail>(`/assignments/${id}`)
  },
  context(): Promise<AssignmentContext> {
    return api.get<AssignmentContext>("/assignments/context")
  },
  create(payload: AssignmentFormPayload): Promise<AssignmentDetail> {
    return api.post<AssignmentDetail>("/assignments", payload)
  },
  update(id: string, payload: Partial<AssignmentFormPayload>): Promise<AssignmentDetail> {
    return api.patch<AssignmentDetail>(`/assignments/${id}`, payload)
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/assignments/${id}`)
  },
}