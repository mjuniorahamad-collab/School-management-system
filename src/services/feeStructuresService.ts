import { api } from "@/lib/apiClient"
import type {
  FeeStructureDetail,
  FeeStructureFormPayload,
  FeeStructureListResult,
  FeeStructuresQuery,
} from "@/types/fees"

function queryString(query: FeeStructuresQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  if (query.search) params.set("search", query.search)
  if (query.sessionId) params.set("sessionId", query.sessionId)
  if (query.classId) params.set("classId", query.classId)
  if (query.isActive) params.set("isActive", query.isActive)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

// Data seam for Fee Structures. All calls hit the real REST API through the
// shared apiClient and return the unwrapped envelope payload.
export const feeStructuresService = {
  list(query: FeeStructuresQuery = {}): Promise<FeeStructureListResult> {
    const qs = queryString(query)
    return api.get<FeeStructureListResult>(`/fees/structures${qs ? `?${qs}` : ""}`)
  },
  get(id: string): Promise<FeeStructureDetail> {
    return api.get<FeeStructureDetail>(`/fees/structures/${id}`)
  },
  create(payload: FeeStructureFormPayload): Promise<FeeStructureDetail> {
    return api.post<FeeStructureDetail>("/fees/structures", payload)
  },
  update(id: string, payload: FeeStructureFormPayload): Promise<FeeStructureDetail> {
    return api.patch<FeeStructureDetail>(`/fees/structures/${id}`, payload)
  },
}