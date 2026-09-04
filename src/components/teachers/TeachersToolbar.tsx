import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { EMPLOYEE_STATUS_OPTIONS } from "@/types/teachers"

interface TeachersToolbarProps {
  search: string
  status: string
  canCreate: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onCreateClick: () => void
}

export function TeachersToolbar({
  search,
  status,
  canCreate,
  onSearchChange,
  onStatusChange,
  onCreateClick,
}: TeachersToolbarProps) {
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
            placeholder="Search name, ID, phone…"
            aria-label="Search teachers"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            Add Teacher
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={status || "all"} onValueChange={(v) => onStatusChange(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[140px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {EMPLOYEE_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "ON_LEAVE" ? "On Leave" : s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
