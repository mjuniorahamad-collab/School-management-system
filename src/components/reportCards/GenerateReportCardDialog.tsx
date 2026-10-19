import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { GenerateConfirmPanel } from "@/components/reportCards/GenerateReportCardConfirmPanel"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAcademicSessions } from "@/hooks/useAcademicSessions"
import { useClassesOptions, useSections } from "@/hooks/useSections"
import { useStudents } from "@/hooks/useStudents"
import type { StudentListItem } from "@/types/students"

const FILTER_ALL = "__ALL__"
const STUDENT_PAGE_SIZE = 20

interface GenerateReportCardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSessionId: string
}

export function GenerateReportCardDialog({
  open,
  onOpenChange,
  defaultSessionId,
}: GenerateReportCardDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate report card</DialogTitle>
          <DialogDescription>
            Select a student in an academic session. The student&apos;s placement for that session
            is used automatically — a scheme must be configured for it first.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <GenerateContent defaultSessionId={defaultSessionId} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function GenerateContent({
  defaultSessionId,
  onOpenChange,
}: {
  defaultSessionId: string
  onOpenChange: (open: boolean) => void
}) {
  const sessions = useAcademicSessions({}).data?.items ?? []
  const fallbackSessionId =
    sessions.find((session) => session.status === "ACTIVE")?.id ?? sessions[0]?.id ?? ""
  const effectiveDefault = defaultSessionId || fallbackSessionId

  const [sessionId, setSessionId] = useState(effectiveDefault)
  const [classId, setClassId] = useState("")
  const [sectionId, setSectionId] = useState("")
  const [search, setSearch] = useState("")
  const [committedSearch, setCommittedSearch] = useState("")
  const [selected, setSelected] = useState<StudentListItem | null>(null)

  const classes = useClassesOptions().data?.items ?? []
  const sections = useSections({ classId: classId || undefined }).data?.items ?? []

  useEffect(() => {
    const timer = setTimeout(() => setCommittedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // Changing any scope filter invalidates the current pick.
  const handleSessionChange = (value: string) => {
    setSessionId(value)
    setSelected(null)
  }
  const handleClassChange = (value: string) => {
    setClassId(value === FILTER_ALL ? "" : value)
    setSectionId("")
    setSelected(null)
  }
  const handleSectionChange = (value: string) => {
    setSectionId(value === FILTER_ALL ? "" : value)
    setSelected(null)
  }

  const studentsQuery = useStudents({
    page: 1,
    pageSize: STUDENT_PAGE_SIZE,
    search: committedSearch || undefined,
    sessionId: sessionId || undefined,
    classId: classId || undefined,
    sectionId: sectionId || undefined,
  })

  const students = studentsQuery.data?.items ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Academic session</Label>
          <Select value={sessionId} onValueChange={handleSessionChange}>
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

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Class (optional filter)</Label>
          <Select
            value={classId === "" ? FILTER_ALL : classId}
            onValueChange={handleClassChange}
          >
            <SelectTrigger className="w-full" aria-label="Class filter">
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

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Section (optional filter)</Label>
          <Select
            value={sectionId === "" ? FILTER_ALL : sectionId}
            onValueChange={handleSectionChange}
            disabled={!classId}
          >
            <SelectTrigger className="w-full" aria-label="Section filter">
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
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs font-medium text-muted-foreground">Student</Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or admission number…"
            aria-label="Search students"
            className="pl-9"
          />
        </div>
      </div>

      <StudentResults
        students={students}
        isPending={studentsQuery.isPending}
        isError={studentsQuery.isError}
        selectedId={selected?.id ?? null}
        total={studentsQuery.data?.pagination.total ?? 0}
        onRetry={() => void studentsQuery.refetch()}
        onSelect={setSelected}
      />

      {selected && (
        <GenerateConfirmPanel
          key={`${selected.id}:${sessionId}`}
          student={selected}
          sessionId={sessionId}
          onOpenChange={onOpenChange}
        />
      )}
    </div>
  )
}

function StudentResults({
  students,
  isPending,
  isError,
  selectedId,
  total,
  onRetry,
  onSelect,
}: {
  students: StudentListItem[]
  isPending: boolean
  isError: boolean
  selectedId: string | null
  total: number
  onRetry: () => void
  onSelect: (student: StudentListItem) => void
}) {
  if (isPending) {
    return <p className="py-4 text-center text-sm text-muted-foreground">Loading students…</p>
  }
  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-6">
        <p className="text-sm text-muted-foreground">Could not load students.</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    )
  }
  if (students.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
        No students found for this session and filter.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-56 overflow-y-auto rounded-lg border">
        <ul className="divide-y">
          {students.map((student) => {
            const name = [student.firstName, student.lastName].filter(Boolean).join(" ")
            const isSelected = student.id === selectedId
            const placement = [
              student.class?.name ?? null,
              student.section ? `Section ${student.section.name}` : null,
            ]
              .filter(Boolean)
              .join(" · ")
            return (
              <li key={student.id}>
                <button
                  type="button"
                  onClick={() => onSelect(student)}
                  aria-pressed={isSelected}
                  className={`flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                    isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">{name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {student.admissionNumber}
                      {placement ? ` · ${placement}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
      {total > students.length && (
        <p className="text-xs text-muted-foreground">
          Showing {students.length} of {total}. Refine the search to narrow the list.
        </p>
      )}
    </div>
  )
}


