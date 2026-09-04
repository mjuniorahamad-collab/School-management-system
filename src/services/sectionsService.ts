import { api } from "@/lib/apiClient"
import type {
  SectionDetail,
  SectionFormPayload,
  SectionListResult,
  SectionsQuery,
} from "@/types/sections"

// Data seam for the Sections module. Every method hits the real REST API through
// the shared apiClient and returns the unwrapped envelope payload.

export function buildSectionsQueryString(query: SectionsQuery): string {
  const params = new URLSearchParams()
  if (query.classId) params.set("classId", query.classId)
  if (query.search) params.set("search", query.search)
  return params.toString()
}

export const sectionsService = {
  list(query: SectionsQuery): Promise<SectionListResult> {
    return api.get<SectionListResult>(`/sections?${buildSectionsQueryString(query)}`)
  },
  get(id: string): Promise<SectionDetail> {
    return api.get<SectionDetail>(`/sections/${id}`)
  },
  create(payload: SectionFormPayload): Promise<SectionDetail> {
    return api.post<SectionDetail>("/sections", payload)
  },
  update(id: string, payload: Partial<SectionFormPayload>): Promise<SectionDetail> {
    return api.patch<SectionDetail>(`/sections/${id}`, payload)
  },
}
