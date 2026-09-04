import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { AttendanceToolbar } from "@/components/attendance/AttendanceToolbar"
import { AttendanceMarking } from "@/components/attendance/AttendanceMarking"
import type { MarkingStudentRow } from "@/components/attendance/AttendanceMarking"
import { AttendanceSummaryView } from "@/components/attendance/AttendanceSummary"
import { AttendanceList } from "@/components/attendance/AttendanceList"
import { AttendanceFormDialog } from "@/components/attendance/AttendanceFormDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAuth } from "@/auth/useAuth"
import {
  useAttendanceRecords,
  useAttendanceSummary,
  useBulkMarkAttendance,
  useDeleteAttendanceRecord,
} from "@/hooks/useAttendance"
import { attendanceBulkMarkToPayload } from "@/lib/attendanceFormRules"
import { studentsService } from "@/services/studentsService"
import type { AttendanceRecordListItem, AttendanceStatusType } from "@/types/attendance"

type AttendanceTab = "marking" | "summary" | "records"

export function AttendancePage() {
  const { can } = useAuth()
  const [academicSessionId, setAcademicSessionId] = useState("")
  const [classId, setClassId] = useState("")
  const [sectionId, setSectionId] = useState("")
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tab, setTab] = useState<AttendanceTab>("marking")

  const [rows, setRows] = useState<MarkingStudentRow[]>([])
  const [editing, setEditing] = useState<AttendanceRecordListItem | null>(null)
  const [deleting, setDeleting] = useState<AttendanceRecordListItem | null>(null)

  const { data: meta } = useQuery({
    queryKey: ["students", "meta"],
    queryFn: () => studentsService.meta(),
  })
  const classes = meta?.classes ?? []
  const sections = classes.find((cls) => cls.id === classId)?.sections ?? []

  const canCreate = can("attendance:create")
  const canEdit = can("attendance:update")
  const canView = can("attendance:view")

  // Prefill row list from students in the selected class.
  const studentsReady = Boolean(academicSessionId && classId)
  const { data: studentsData, isPending: studentsPending, isError: studentsError, refetch: refetchStudents } = useQuery({
    queryKey: ["students", "for-attendance", academicSessionId, classId, sectionId],
    queryFn: () =>
      studentsService.list({
        page: 1,
        pageSize: 500,
        sessionId: academicSessionId,
        classId,
        sectionId: sectionId || undefined,
      }),
    enabled: studentsReady,
  })

  const loadRoster = () => {
    setRows([])
    refetchStudents().then((result) => {
      const items = result.data?.items ?? []
      setRows(
        items.map((s) => ({
          studentId: s.id,
          studentName: s.name,
          admissionNumber: s.admissionNumber,
          status: "PRESENT" as AttendanceStatusType,
          note: "",
        })),
      )
    })
  }

  const bulkMutation = useBulkMarkAttendance()
  const deleteMutation = useDeleteAttendanceRecord()

  const setRowStatus = (studentId: string, status: AttendanceStatusType) => {
    setRows((previous) =>
      previous.map((row) => (row.studentId === studentId ? { ...row, status } : row)),
    )
  }

  const setRowNote = (studentId: string, note: string) => {
    setRows((previous) =>
      previous.map((row) => (row.studentId === studentId ? { ...row, note } : row)),
    )
  }

  const handleBulkSave = () => {
    if (!academicSessionId || !classId || !date) {
      return
    }
    bulkMutation.mutate(
      attendanceBulkMarkToPayload({
        academicSessionId,
        classId,
        sectionId: sectionId || null,
        date,
        records: rows,
      }),
    )
  }

  const availableLearners = rows.length > 0 ? rows : studentsData?.items ?? []

  const summaryQuery = {
    academicSessionId,
    classId,
    sectionId: sectionId || undefined,
    dateFrom: date,
    dateTo: date,
  }
  const summaryData = useAttendanceSummary(summaryQuery)

  const { data: recordsData, isPending: recordsPending, isError: recordsError, refetch: refetchRecords } =
    useAttendanceRecords({
      academicSessionId: academicSessionId || undefined,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      dateFrom: date,
      dateTo: date,
    })

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader title="Attendance" description="Mark and review daily class attendance." />

        <AttendanceToolbar
          academicSessionId={academicSessionId}
          onAcademicSessionChange={(v) => {
            setAcademicSessionId(v)
            setRows([])
          }}
          classId={classId}
          onClassChange={(v) => {
            setClassId(v)
            setSectionId("")
            setRows([])
          }}
          sectionId={sectionId}
          onSectionChange={(v) => {
            setSectionId(v)
            setRows([])
          }}
          date={date}
          onDateChange={setDate}
          sections={sections}
        />

        {canView && (
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "marking", label: "Daily Marking" },
                { id: "summary", label: "Summary" },
                { id: "records", label: "Records" },
              ] as Array<{ id: AttendanceTab; label: string }>
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-3 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
                aria-pressed={tab === t.id}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {tab === "marking" && (
          <div className="flex flex-col gap-4">
            {canCreate && (
              <div className="flex items-center justify-end">
                <Button
                  onClick={loadRoster}
                  variant={availableLearners.length === 0 ? "default" : "outline"}
                >
                  Load roster
                </Button>
              </div>
            )}
            {canCreate ? (
              <AttendanceMarking
                students={rows}
                isPending={studentsPending}
                isError={studentsError}
                onRetry={loadRoster}
                onStatusChange={setRowStatus}
                onNoteChange={setRowNote}
              />
            ) : (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                You do not have permission to mark attendance.
              </p>
            )}
            {canCreate && rows.length > 0 && academicSessionId && classId && date && (
              <div className="flex items-center justify-end">
                <Button onClick={handleBulkSave} disabled={bulkMutation.isPending}>
                  {bulkMutation.isPending ? "Saving…" : "Save attendance"}
                </Button>
              </div>
            )}
          </div>
        )}

        {tab === "summary" && (
          <AttendanceSummaryView
            items={summaryData.data?.items ?? []}
            totalDays={summaryData.data?.totalDays ?? 0}
            isPending={summaryData.isPending}
            isError={summaryData.isError}
            onRetry={() => void summaryData.refetch()}
          />
        )}

        {tab === "records" && (
          <AttendanceList
            items={recordsData?.items ?? []}
            isPending={recordsPending}
            isError={recordsError}
            canEdit={canEdit}
            canDelete={can("attendance:update")}
            onRetry={() => void refetchRecords()}
            onEdit={(record) => setEditing(record)}
            onDelete={(record) => setDeleting(record)}
          />
        )}

        <AttendanceFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          editing={editing}
        />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Delete attendance record?"
          description={`This will remove the attendance record for ${deleting?.studentName ?? ""} on ${deleting?.date ?? ""}.`}
          confirmLabel="Delete record"
          isPending={deleteMutation.isPending}
          onConfirm={() => {
            if (deleting) {
              deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) })
            }
          }}
        />
      </div>
    </PageContainer>
  )
}
