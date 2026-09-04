import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface SubjectsToolbarProps {
  search: string
  canCreate: boolean
  onSearchChange: (value: string) => void
  onCreateClick: () => void
}

export function SubjectsToolbar({ search, canCreate, onSearchChange, onCreateClick }: SubjectsToolbarProps) {
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
            placeholder="Search name or code…"
            aria-label="Search subjects"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            New Subject
          </Button>
        )}
      </div>
    </div>
  )
}
