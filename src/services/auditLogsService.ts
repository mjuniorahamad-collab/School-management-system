import { api } from "@/lib/apiClient"
import type {
  AuditLogDetail,
  AuditLogListResult,
  ListAuditLogsQuery,
} from "@/types/auditLogs"

// Data seam for the Audit Logs module. Every method hits the real REST API
// through the shared apiClient and returns the unwrapped envelope payload.

function appendParams(
  params: URLSearchParams,
  query: ListAuditLogsQuery,
  exportOnly: boolean,
): void {
  if (query.search) params.set("search", query.search)
  if (query.entityType) params.set("entityType", query.entityType)
  if (query.action) params.set("action", query.action)
  if (query.actorId) params.set("actorId", query.actorId)
  if (query.entityId) params.set("entityId", query.entityId)
  if (query.from) params.set("from", query.from)
  if (query.to) params.set("to", query.to)
  if (!exportOnly) {
    params.set("page", String(query.page))
    params.set("pageSize", String(query.pageSize))
  }
}

export function buildAuditLogsQueryString(query: ListAuditLogsQuery): string {
  const params = new URLSearchParams()
  appendParams(params, query, false)
  return params.toString()
}

export const auditLogsService = {
  list(query: ListAuditLogsQuery): Promise<AuditLogListResult> {
    return api.get<AuditLogListResult>(`/audit-logs?${buildAuditLogsQueryString(query)}`)
  },
  get(id: string): Promise<AuditLogDetail> {
    return api.get<AuditLogDetail>(`/audit-logs/${id}`)
  },
}

export function buildAuditLogsExportUrl(query: ListAuditLogsQuery): string {
  const params = new URLSearchParams()
  appendParams(params, query, true)
  const suffix = params.size > 0 ? `?${params.toString()}` : ""
  return `/audit-logs/export${suffix}`
}