import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AdmissionApplicationStatus } from "@/types/admissions"

interface AdmissionsToolbarProps {
  search: string
  status: AdmissionApplicationStatus | ""
  canCreate: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: AdmissionApplicationStatus | "") => void
  onCreateClick: () => void
}

export function AdmissionsToolbar({
  search,
  status,
  canCreate,
  onSearchChange,
  onStatusChange,
  onCreateClick,
}: AdmissionsToolbarProps) {
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
            placeholder="Search applicants…"
            aria-label="Search admission applications"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            New Application
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status}
          onValueChange={(value) => onStatusChange((value === "all" ? "" : value) as AdmissionApplicationStatus)}
        >
          <SelectTrigger className="w-full sm:w-auto" aria-label="All statuses">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
            <SelectItem value="CONVERTED">Converted</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
