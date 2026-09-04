import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TASK_STATUS_OPTIONS, TASK_STATUS_LABELS } from "@/types/homework"
import type { TaskStatus } from "@/types/homework"

interface HomeworkToolbarProps {
  search: string
  status: TaskStatus | ""
  canCreate: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: TaskStatus | "") => void
  onCreateClick: () => void
}

export function HomeworkToolbar({
  search,
  status,
  canCreate,
  onSearchChange,
  onStatusChange,
  onCreateClick,
}: HomeworkToolbarProps) {
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
            placeholder="Search homework…"
            aria-label="Search homework"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            New Homework
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status || "all"}
          onValueChange={(value) => (value === "all" ? onStatusChange("") : onStatusChange(value as TaskStatus))}
        >
          <SelectTrigger className="w-[160px]" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {TASK_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}