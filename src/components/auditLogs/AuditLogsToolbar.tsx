import { Download, Search } from "lucide-react"
import { API_BASE_URL } from "@/lib/apiClient"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AUDIT_ACTION_OPTIONS, AUDIT_ENTITY_OPTIONS } from "@/types/auditLogs"

interface AuditLogsToolbarProps {
  search: string
  entityType: string
  action: string
  from: string
  to: string
  canExport: boolean
  exportHref: string
  onSearchChange: (value: string) => void
  onEntityTypeChange: (value: string) => void
  onActionChange: (value: string) => void
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}

export function AuditLogsToolbar({
  search,
  entityType,
  action,
  from,
  to,
  canExport,
  exportHref,
  onSearchChange,
  onEntityTypeChange,
  onActionChange,
  onFromChange,
  onToChange,
}: AuditLogsToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search actor, summary, or ID…"
            aria-label="Search audit logs"
            className="pl-9"
          />
        </div>
        {canExport && (
          <Button variant="outline" asChild className="shrink-0">
            <a href={`${API_BASE_URL}${exportHref}`} download>
              <Download className="size-4" aria-hidden="true" />
              Export CSV
            </a>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={entityType || "all"} onValueChange={(v) => onEntityTypeChange(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by entity type">
            <SelectValue placeholder="All entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All entities</SelectItem>
            {AUDIT_ENTITY_OPTIONS.map((entity) => (
              <SelectItem key={entity} value={entity}>
                {entity.replaceAll("_", " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={action || "all"} onValueChange={(v) => onActionChange(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[170px]" aria-label="Filter by action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {AUDIT_ACTION_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option.replaceAll("_", " ").toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={from}
          onChange={(event) => onFromChange(event.target.value)}
          aria-label="From date"
          className="w-[150px]"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => onToChange(event.target.value)}
          aria-label="To date"
          className="w-[150px]"
        />
      </div>
    </div>
  )
}