import { Plus, LayoutGrid, List } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { classesService } from "@/services/classesService"
import { academicSessionsService } from "@/services/academicSessionsService"

export type TimetableViewMode = "grid" | "list"

interface TimetableToolbarProps {
  viewMode: TimetableViewMode
  onViewModeChange: (mode: TimetableViewMode) => void
  academicSessionId: string
  onAcademicSessionChange: (value: string) => void
  classId: string
  onClassChange: (value: string) => void
  sectionId: string
  onSectionChange: (value: string) => void
  sections: Array<{ id: string; name: string }>
  canCreate: boolean
  onCreateClick: () => void
}

export function TimetableToolbar({
  viewMode,
  onViewModeChange,
  academicSessionId,
  onAcademicSessionChange,
  classId,
  onClassChange,
  sectionId,
  onSectionChange,
  sections,
  canCreate,
  onCreateClick,
}: TimetableToolbarProps) {
  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions", "options"],
    queryFn: () => academicSessionsService.list({}),
  })
  const { data: classes } = useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => classesService.list({}),
  })

  const sessionItems = sessions?.items ?? []
  const classItems = classes?.items ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={academicSessionId} onValueChange={onAcademicSessionChange}>
            <SelectTrigger className="w-full sm:w-56" aria-label="Academic session">
              <SelectValue placeholder="Select session" />
            </SelectTrigger>
            <SelectContent>
              {sessionItems.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading sessions…
                </div>
              )}
              {sessionItems.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={classId} onValueChange={onClassChange}>
            <SelectTrigger className="w-full sm:w-48" aria-label="Class">
              <SelectValue placeholder="All classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classItems.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {classId && classId !== "all" && sections.length > 0 && (
            <Select value={sectionId} onValueChange={onSectionChange}>
              <SelectTrigger className="w-full sm:w-40" aria-label="Section">
                <SelectValue placeholder="All sections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sections</SelectItem>
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`gap-1.5 ${viewMode === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => onViewModeChange("grid")}
              aria-label="Grid view"
            >
              <LayoutGrid className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Grid</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={`gap-1.5 ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
            >
              <List className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">List</span>
            </Button>
          </div>

          {canCreate && (
            <Button onClick={onCreateClick} className="shrink-0">
              <Plus className="size-4" aria-hidden="true" />
              New Entry
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
