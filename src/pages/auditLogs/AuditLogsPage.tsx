import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { AuditLogDetailDialog } from "@/components/auditLogs/AuditLogDetailDialog"
import { AuditLogsCards, AuditLogsTable } from "@/components/auditLogs/AuditLogsList"
import { AuditLogsToolbar } from "@/components/auditLogs/AuditLogsToolbar"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { useAuditLogs } from "@/hooks/useAuditLogs"
import { buildAuditLogsExportUrl } from "@/services/auditLogsService"
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_ENTITY_OPTIONS,
  type ListAuditLogsQuery,
} from "@/types/auditLogs"

const SEARCH_DEBOUNCE_MS = 350
const DEFAULT_PAGE_SIZE = 20

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

function asEnum<T extends string>(value: string, values: readonly T[]): T | undefined {
  return (values as readonly string[]).includes(value) ? (value as T) : undefined
}

export function AuditLogsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [entityTypeDraft, setEntityTypeDraft] = useState(() => readParam(searchParams, "entityType"))
  const [actionDraft, setActionDraft] = useState(() => readParam(searchParams, "action"))
  const [fromDraft, setFromDraft] = useState(() => readParam(searchParams, "from"))
  const [toDraft, setToDraft] = useState(() => readParam(searchParams, "to"))

  const [detailId, setDetailId] = useState<string | null>(null)

  const search = readParam(searchParams, "search")
  const entityType = readParam(searchParams, "entityType")
  const action = readParam(searchParams, "action")
  const from = readParam(searchParams, "from")
  const to = readParam(searchParams, "to")
  const page = Math.max(1, Number(readParam(searchParams, "page")) || 1)
  const pageSize = Math.max(1, Number(readParam(searchParams, "pageSize")) || DEFAULT_PAGE_SIZE)

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (searchDraft) next.set("search", searchDraft)
      else next.delete("search")
      if (entityTypeDraft) next.set("entityType", entityTypeDraft)
      else next.delete("entityType")
      if (actionDraft) next.set("action", actionDraft)
      else next.delete("action")
      if (fromDraft) next.set("from", fromDraft)
      else next.delete("from")
      if (toDraft) next.set("to", toDraft)
      else next.delete("to")
      next.delete("page")
      setSearchParams(next, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, entityTypeDraft, actionDraft, fromDraft, toDraft, setSearchParams])

  const query: ListAuditLogsQuery = {
    page,
    pageSize,
    search: search || undefined,
    entityType: asEnum(entityType, AUDIT_ENTITY_OPTIONS),
    action: asEnum(action, AUDIT_ACTION_OPTIONS),
    from: from || undefined,
    to: to || undefined,
  }

  const { data, isPending, isError, refetch } = useAuditLogs(query)

  const items = data?.items ?? []
  const pagination = data?.pagination
  const total = pagination?.total ?? 0
  const totalPages = Math.max(1, pagination?.totalPages ?? 1)

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    setSearchParams(next, { replace: true })
  }

  const exportHref = buildAuditLogsExportUrl({
    page,
    pageSize,
    search: search || undefined,
    entityType: query.entityType,
    action: query.action,
    from: from || undefined,
    to: to || undefined,
  })

  if (!can("audit-logs:view")) {
    return (
      <PageContainer>
        <PageHeader
          title="Audit Logs"
          description="Immutable trail of administrative actions for compliance."
        />
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
          You do not have permission to view the audit trail.
        </p>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Audit Logs"
          description="Immutable trail of administrative actions for compliance."
        />
        <AuditLogsToolbar
          search={searchDraft}
          entityType={entityTypeDraft}
          action={actionDraft}
          from={fromDraft}
          to={toDraft}
          canExport={can("audit-logs:export")}
          exportHref={exportHref}
          onSearchChange={setSearchDraft}
          onEntityTypeChange={setEntityTypeDraft}
          onActionChange={setActionDraft}
          onFromChange={setFromDraft}
          onToChange={setToDraft}
        />

        <AuditLogsTable
          items={items}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          onSelect={(item) => setDetailId(item.id)}
        />
        <AuditLogsCards
          items={items}
          isPending={isPending}
          isError={isError}
          onRetry={() => void refetch()}
          onSelect={(item) => setDetailId(item.id)}
        />

        {items.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages} · {total} record{total !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => goToPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                ← Prev
              </button>
              <span>Page {page}</span>
              <button
                type="button"
                onClick={() => goToPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <AuditLogDetailDialog
          logId={detailId}
          onOpenChange={(open) => {
            if (!open) setDetailId(null)
          }}
        />
      </div>
    </PageContainer>
  )
}