import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SECTION_FILTER_ALL, SECTION_FILTER_CLASS } from "@/lib/reportCardSchemeScope"
import type { AcademicSessionListItem } from "@/types/academicSessions"
import type { ClassListItem } from "@/types/classes"
import type { SectionListItem } from "@/types/sections"

/** Radix Select cannot use an empty string as an item value. */
const CLASS_FILTER_ALL = "__ALL__"

interface ReportCardSchemesToolbarProps {
  sessions: AcademicSessionListItem[]
  sessionId: string
  onSessionChange: (id: string) => void
  classes: ClassListItem[]
  classId: string
  onClassChange: (id: string) => void
  sections: SectionListItem[]
  sectionFilter: string
  onSectionFilterChange: (value: string) => void
  canCreate: boolean
  onCreateClick: () => void
}

export function ReportCardSchemesToolbar({
  sessions,
  sessionId,
  onSessionChange,
  classes,
  classId,
  onClassChange,
  sections,
  sectionFilter,
  onSectionFilterChange,
  canCreate,
  onCreateClick,
}: ReportCardSchemesToolbarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-44">
        <Label className="text-xs font-medium text-muted-foreground">Academic session</Label>
        <Select value={sessionId} onValueChange={onSessionChange}>
          <SelectTrigger className="w-full" aria-label="Academic session">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.name} ({session.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-44">
        <Label className="text-xs font-medium text-muted-foreground">Class</Label>
        <Select
          value={classId === "" ? CLASS_FILTER_ALL : classId}
          onValueChange={(value) => onClassChange(value === CLASS_FILTER_ALL ? "" : value)}
        >
          <SelectTrigger className="w-full" aria-label="Class">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CLASS_FILTER_ALL}>All classes</SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-44">
        <Label className="text-xs font-medium text-muted-foreground">Scope</Label>
        <Select
          value={sectionFilter}
          onValueChange={onSectionFilterChange}
          disabled={!classId}
        >
          <SelectTrigger className="w-full" aria-label="Scope">
            <SelectValue placeholder="All scopes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={SECTION_FILTER_ALL}>All scopes</SelectItem>
            <SelectItem value={SECTION_FILTER_CLASS}>Class-level only</SelectItem>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                Section {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canCreate && (
        <Button onClick={onCreateClick} className="shrink-0 sm:ml-auto">
          <Plus className="size-4" aria-hidden="true" />
          New scheme
        </Button>
      )}
    </div>
  )
}
