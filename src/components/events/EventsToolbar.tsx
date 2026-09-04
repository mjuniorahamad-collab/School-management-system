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
import type { EventCategory, EventStatus } from "@/types/communication"

interface EventsToolbarProps {
  search: string
  category: EventCategory | ""
  status: EventStatus | ""
  canCreate: boolean
  onSearchChange: (value: string) => void
  onCategoryChange: (value: EventCategory | "") => void
  onStatusChange: (value: EventStatus | "") => void
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

export function EventsToolbar({
  search,
  category,
  status,
  canCreate,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onCreateClick,
}: EventsToolbarProps) {
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
            placeholder="Search events…"
            aria-label="Search events"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            New Event
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          value={category}
          onValueChange={(v) => onCategoryChange(v as EventCategory)}
          placeholder="All categories"
          items={[
            { value: "GENERAL", label: "General" },
            { value: "ACADEMIC", label: "Academic" },
            { value: "SPORTS", label: "Sports" },
            { value: "CULTURAL", label: "Cultural" },
            { value: "COMMUNITY", label: "Community" },
          ]}
        />
        <FilterSelect
          value={status}
          onValueChange={(v) => onStatusChange(v as EventStatus)}
          placeholder="All statuses"
          items={[
            { value: "SCHEDULED", label: "Scheduled" },
            { value: "ONGOING", label: "Ongoing" },
            { value: "COMPLETED", label: "Completed" },
            { value: "CANCELLED", label: "Cancelled" },
          ]}
        />
      </div>
    </div>
  )
}
