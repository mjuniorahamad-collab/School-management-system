import { useQuery } from "@tanstack/react-query"
import { auditLogsService } from "@/services/auditLogsService"
import type { ListAuditLogsQuery } from "@/types/auditLogs"

export function useAuditLogs(query: ListAuditLogsQuery) {
  return useQuery({
    queryKey: ["audit-logs", query],
    queryFn: () => auditLogsService.list(query),
    placeholderData: (previous) => previous,
  })
}

export function useAuditLog(id: string | null) {
  return useQuery({
    queryKey: ["audit-logs", "detail", id],
    queryFn: () => auditLogsService.get(id as string),
    enabled: id !== null,
  })
}