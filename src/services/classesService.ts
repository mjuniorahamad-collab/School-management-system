import { api } from "@/lib/apiClient"
import type {
  ClassDetail,
  ClassFormPayload,
  ClassListResult,
  ClassesQuery,
} from "@/types/classes"

// Data seam for the Classes module. Every method hits the real REST API through
// the shared apiClient and returns the unwrapped envelope payload.

export function buildClassesQueryString(query: ClassesQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  return params.toString()
}

export const classesService = {
  list(query: ClassesQuery): Promise<ClassListResult> {
    return api.get<ClassListResult>(`/classes?${buildClassesQueryString(query)}`)
  },
  get(id: string): Promise<ClassDetail> {
    return api.get<ClassDetail>(`/classes/${id}`)
  },
  create(payload: ClassFormPayload): Promise<ClassDetail> {
    return api.post<ClassDetail>("/classes", payload)
  },
  update(id: string, payload: Partial<ClassFormPayload>): Promise<ClassDetail> {
    return api.patch<ClassDetail>(`/classes/${id}`, payload)
  },
}
