import { api } from "@/lib/apiClient"
import type {
  AdjustActionInput,
  AdjustmentDetail,
  AdjustmentListResult,
  AdjustmentQuery,
  OverrideAdjustmentInput,
  RequestAdjustmentInput,
} from "@/types/concessions"

function queryString(query: AdjustmentQuery): string {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.pageSize) params.set("pageSize", String(query.pageSize))
  if (query.sessionId) params.set("sessionId", query.sessionId)
  if (query.studentId) params.set("studentId", query.studentId)
  if (query.invoiceId) params.set("invoiceId", query.invoiceId)
  if (query.status) params.set("status", query.status)
  if (query.kind) params.set("kind", query.kind)
  if (query.search) params.set("search", query.search)
  if (query.sortBy) params.set("sortBy", query.sortBy)
  if (query.sortDir) params.set("sortDir", query.sortDir)
  return params.toString()
}

// Data seam for Fee Concessions (adjustments to generated invoices). Money
// changes are single-purpose mutations; every transition is guarded server-side
// by status transitions and the RBAC `concessions:*` permissions.
export const concessionsService = {
  list(query: AdjustmentQuery = {}): Promise<AdjustmentListResult> {
    const qs = queryString(query)
    return api.get<AdjustmentListResult>(`/fees/adjustments${qs ? `?${qs}` : ""}`)
  },
  get(id: string): Promise<AdjustmentDetail> {
    return api.get<AdjustmentDetail>(`/fees/adjustments/${id}`)
  },
  request(payload: RequestAdjustmentInput): Promise<AdjustmentDetail> {
    return api.post<AdjustmentDetail>("/fees/adjustments", payload)
  },
  approve(id: string): Promise<AdjustmentDetail> {
    return api.post<AdjustmentDetail>(`/fees/adjustments/${id}/approve`, {})
  },
  override(id: string, payload: OverrideAdjustmentInput): Promise<AdjustmentDetail> {
    return api.post<AdjustmentDetail>(`/fees/adjustments/${id}/override`, payload)
  },
  reject(id: string, payload: AdjustActionInput = {}): Promise<AdjustmentDetail> {
    return api.post<AdjustmentDetail>(`/fees/adjustments/${id}/reject`, payload)
  },
  cancel(id: string, payload: AdjustActionInput = {}): Promise<AdjustmentDetail> {
    return api.post<AdjustmentDetail>(`/fees/adjustments/${id}/cancel`, payload)
  },
  reverse(id: string, payload: AdjustActionInput = {}): Promise<AdjustmentDetail> {
    return api.post<AdjustmentDetail>(`/fees/adjustments/${id}/reverse`, payload)
  },
}