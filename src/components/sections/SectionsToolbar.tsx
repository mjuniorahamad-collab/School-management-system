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
import { useClassesOptions } from "@/hooks/useSections"

interface SectionsToolbarProps {
  search: string
  classId: string
  canCreate: boolean
  onSearchChange: (value: string) => void
  onClassChange: (value: string) => void
  onCreateClick: () => void
}

export function SectionsToolbar({
  search,
  classId,
  canCreate,
  onSearchChange,
  onClassChange,
  onCreateClick,
}: SectionsToolbarProps) {
  const { data: classes } = useClassesOptions()

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
            placeholder="Search sections…"
            aria-label="Search sections"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            New Section
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={classId} onValueChange={onClassChange}>
          <SelectTrigger className="w-full sm:w-48" aria-label="Class">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {classes?.items.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                Class {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
