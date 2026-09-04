import { useQuery } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { academicSessionsService } from "@/services/academicSessionsService"
import { studentsService } from "@/services/studentsService"

interface AttendanceToolbarProps {
  academicSessionId: string
  onAcademicSessionChange: (value: string) => void
  classId: string
  onClassChange: (value: string) => void
  sectionId: string
  onSectionChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
  sections: Array<{ id: string; name: string }>
}

export function AttendanceToolbar({
  academicSessionId,
  onAcademicSessionChange,
  classId,
  onClassChange,
  sectionId,
  onSectionChange,
  date,
  onDateChange,
  sections,
}: AttendanceToolbarProps) {
  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions", "options"],
    queryFn: () => academicSessionsService.list({}),
  })
  const { data: meta } = useQuery({
    queryKey: ["students", "meta"],
    queryFn: () => studentsService.meta(),
  })

  const classes = meta?.classes ?? []

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendance-session">Academic session</Label>
          <Select value={academicSessionId} onValueChange={onAcademicSessionChange}>
            <SelectTrigger id="attendance-session" className="w-full">
              <SelectValue placeholder="Select session" />
            </SelectTrigger>
            <SelectContent>
              {(sessions?.items ?? []).length === 0 && (
                <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Loading sessions…
                </div>
              )}
              {(sessions?.items ?? []).map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendance-class">Class</Label>
          <Select
            value={classId}
            onValueChange={(value) => {
              onClassChange(value)
              onSectionChange("")
            }}
          >
            <SelectTrigger id="attendance-class" className="w-full">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((cls) => (
                <SelectItem key={cls.id} value={cls.id}>
                  {cls.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendance-section">Section</Label>
          <Select value={sectionId} onValueChange={onSectionChange}>
            <SelectTrigger id="attendance-section" className="w-full">
              <SelectValue placeholder="Whole class" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={""}>Whole class</SelectItem>
              {sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="attendance-date">Date</Label>
          <Input
            id="attendance-date"
            type="date"
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </div>
      </div>
    </div>
  )
}
