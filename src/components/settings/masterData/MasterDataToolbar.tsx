import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface MasterDataToolbarProps {
  search: string
  canEdit: boolean
  createLabel: string
  onSearchChange: (value: string) => void
  onCreateClick: () => void
}

export function MasterDataToolbar({
  search,
  canEdit,
  createLabel,
  onSearchChange,
  onCreateClick,
}: MasterDataToolbarProps) {
  return (
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
          placeholder="Search…"
          aria-label="Search master data"
          className="pl-9"
        />
      </div>
      {canEdit && (
        <Button onClick={onCreateClick} className="shrink-0">
          <Plus className="size-4" aria-hidden="true" />
          {createLabel}
        </Button>
      )}
    </div>
  )
}
