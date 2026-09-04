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
import type { NoticeAudience, NoticeStatus } from "@/types/communication"

interface NoticesToolbarProps {
  search: string
  status: NoticeStatus | ""
  audience: NoticeAudience | ""
  canCreate: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: NoticeStatus | "") => void
  onAudienceChange: (value: NoticeAudience | "") => void
  onCreateClick: () => void
}

function FilterSelect({
  value,
  onValueChange,
  placeholder,
  items,
}: {
  value: string
  onValueChange: (value: string) => void
  placeholder: string
  items: Array<{ value: string; label: string }>
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => (v === "all" ? onValueChange("") : onValueChange(v))}
    >
      <SelectTrigger className="w-full sm:w-auto" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function NoticesToolbar({
  search,
  status,
  audience,
  canCreate,
  onSearchChange,
  onStatusChange,
  onAudienceChange,
  onCreateClick,
}: NoticesToolbarProps) {
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
            placeholder="Search notices…"
            aria-label="Search notices"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            New Notice
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={status}
          onValueChange={(v) => onStatusChange(v as NoticeStatus)}
          placeholder="All statuses"
          items={[
            { value: "DRAFT", label: "Draft" },
            { value: "PUBLISHED", label: "Published" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />
        <FilterSelect
          value={audience}
          onValueChange={(v) => onAudienceChange(v as NoticeAudience)}
          placeholder="All audiences"
          items={[
            { value: "EVERYONE", label: "Everyone" },
            { value: "STUDENTS", label: "Students" },
            { value: "PARENTS", label: "Parents" },
            { value: "TEACHERS", label: "Teachers" },
            { value: "STAFF", label: "Staff" },
          ]}
        />
      </div>
    </div>
  )
}
