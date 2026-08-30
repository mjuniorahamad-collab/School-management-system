import { Download, Plus, Search } from "lucide-react"
import { Link } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { API_BASE_URL } from "@/lib/apiClient"
import { useStudentsMeta } from "@/hooks/useStudents"
import { STUDENT_STATUS_OPTIONS } from "@/types/students"
import type { StudentStatus } from "@/types/students"

interface StudentsToolbarProps {
  search: string
  classId: string
  sectionId: string
  status: StudentStatus | ""
  sessionId: string
  exportHref: string
  onSearchChange: (value: string) => void
  onClassChange: (value: string) => void
  onSectionChange: (value: string) => void
  onStatusChange: (value: StudentStatus | "") => void
  onSessionChange: (value: string) => void
}

export function StudentsToolbar({
  search,
  classId,
  sectionId,
  status,
  sessionId,
  exportHref,
  onSearchChange,
  onClassChange,
  onSectionChange,
  onStatusChange,
  onSessionChange,
}: StudentsToolbarProps) {
  const { can } = useAuth()
  const { data: meta } = useStudentsMeta()

  const selectedClass = meta?.classes.find((cls) => cls.id === classId)

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
            placeholder="Search name, admission no., guardian…"
            aria-label="Search students"
            className="pl-9"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="default" asChild>
            <a href={`${API_BASE_URL}${exportHref}`} download>
              <Download className="size-4" aria-hidden="true" />
              Export
            </a>
          </Button>
          {can("students:create") && (
            <Button asChild>
              <Link to="/students/new">
                <Plus className="size-4" aria-hidden="true" />
                Add Student
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={sessionId}
          onValueChange={onSessionChange}
        >
          <SelectTrigger className="w-full sm:w-52" aria-label="Academic session">
            <SelectValue placeholder="Academic session" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sessions</SelectItem>
            {meta?.academicSessions.map((session) => (
              <SelectItem key={session.id} value={session.id}>
                {session.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={classId} onValueChange={onClassChange}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Class">
            <SelectValue placeholder="All classes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {meta?.classes.map((cls) => (
              <SelectItem key={cls.id} value={cls.id}>
                Class {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sectionId}
          onValueChange={onSectionChange}
          disabled={!selectedClass}
        >
          <SelectTrigger className="w-full sm:w-32" aria-label="Section">
            <SelectValue placeholder={selectedClass ? "All sections" : "Select class first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {selectedClass?.sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                Section {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={(value) => onStatusChange(value as StudentStatus | "")}>
          <SelectTrigger className="w-full sm:w-36" aria-label="Status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STUDENT_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}