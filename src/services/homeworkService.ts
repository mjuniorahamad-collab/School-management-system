import { api } from "@/lib/apiClient"
import type {
  HomeworkContext,
  HomeworkDetail,
  HomeworkFormPayload,
  HomeworkListResult,
  HomeworksQuery,
} from "@/types/homework"

export function buildHomeworksQueryString(query: HomeworksQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.status) params.set("status", query.status)
  if (query.classId) params.set("classId", query.classId)
  if (query.subjectId) params.set("subjectId", query.subjectId)
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  return params.toString()
}

// Data seam for the Homework module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.
export const homeworkService = {
  list(query: HomeworksQuery): Promise<HomeworkListResult> {
    return api.get<HomeworkListResult>(`/homework?${buildHomeworksQueryString(query)}`)
  },
  get(id: string): Promise<HomeworkDetail> {
    return api.get<HomeworkDetail>(`/homework/${id}`)
  },
  context(): Promise<HomeworkContext> {
    return api.get<HomeworkContext>("/homework/context")
  },
  create(payload: HomeworkFormPayload): Promise<HomeworkDetail> {
    return api.post<HomeworkDetail>("/homework", payload)
  },
  update(id: string, payload: Partial<HomeworkFormPayload>): Promise<HomeworkDetail> {
    return api.patch<HomeworkDetail>(`/homework/${id}`, payload)
  },
  remove(id: string): Promise<{ id: string; deleted: boolean }> {
    return api.delete<{ id: string; deleted: boolean }>(`/homework/${id}`)
  },
}