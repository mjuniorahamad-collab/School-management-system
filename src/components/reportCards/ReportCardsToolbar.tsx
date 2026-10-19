import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { REPORT_CARD_STATUS_LABELS } from "@/lib/reportCardStatus"
import type { ReportCardStatus } from "@/types/reportCard"
import type { AcademicSessionListItem } from "@/types/academicSessions"
import type { ClassListItem } from "@/types/classes"
import type { SectionListItem } from "@/types/sections"

/** Radix Select cannot use an empty string as an item value. */
const FILTER_ALL = "__ALL__"

const STATUS_OPTIONS: readonly ReportCardStatus[] = [
  "DRAFT",
  "PENDING_ARCHIVE",
  "ISSUED",
  "SUPERSEDED",
  "VOID",
]

interface ReportCardsToolbarProps {
  sessions: AcademicSessionListItem[]
  sessionId: string
  onSessionChange: (id: string) => void
  classes: ClassListItem[]
  classId: string
  onClassChange: (id: string) => void
  sections: SectionListItem[]
  sectionId: string
  onSectionChange: (id: string) => void
  status: string
  onStatusChange: (value: string) => void
  canGenerate: boolean
  onGenerateClick: () => void
}

export function ReportCardsToolbar({
  sessions,
  sessionId,
  onSessionChange,
  classes,
  classId,
  onClassChange,
  sections,
  sectionId,
  onSectionChange,
  status,
  onStatusChange,
  canGenerate,
  onGenerateClick,
}: ReportCardsToolbarProps) {
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

      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-40">
        <Label className="text-xs font-medium text-muted-foreground">Class</Label>
        <Select
          value={classId === "" ? FILTER_ALL : classId}
          onValueChange={(value) => onClassChange(value === FILTER_ALL ? "" : value)}
        >
          <SelectTrigger className="w-full" aria-label="Class">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL}>All classes</SelectItem>
            {classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-36">
        <Label className="text-xs font-medium text-muted-foreground">Section</Label>
        <Select
          value={sectionId === "" ? FILTER_ALL : sectionId}
          onValueChange={(value) => onSectionChange(value === FILTER_ALL ? "" : value)}
          disabled={!classId}
        >
          <SelectTrigger className="w-full" aria-label="Section">
            <SelectValue placeholder={classId ? "All sections" : "Select class first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL}>All sections</SelectItem>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                Section {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 sm:min-w-40">
        <Label className="text-xs font-medium text-muted-foreground">Status</Label>
        <Select
          value={status === "" ? FILTER_ALL : status}
          onValueChange={(value) => onStatusChange(value === FILTER_ALL ? "" : value)}
        >
          <SelectTrigger className="w-full" aria-label="Status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FILTER_ALL}>All statuses</SelectItem>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {REPORT_CARD_STATUS_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {canGenerate && (
        <Button onClick={onGenerateClick} className="shrink-0 sm:ml-auto">
          <Plus className="size-4" aria-hidden="true" />
          Generate report card
        </Button>
      )}
    </div>
  )
}
