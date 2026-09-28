import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { TimetableToolbar } from "@/components/timetable/TimetableToolbar"
import type { TimetableViewMode } from "@/components/timetable/TimetableToolbar"
import { TimetableGrid } from "@/components/timetable/TimetableGrid"
import { TimetablePrintDocument } from "@/components/timetable/TimetablePrintDocument"
import { PrintButton } from "@/components/print/PrintButton"
import { TimetableList } from "@/components/timetable/TimetableList"
import { TimetableFormDialog } from "@/components/timetable/TimetableFormDialog"
import { CopyDayDialog } from "@/components/timetable/CopyDayDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAuth } from "@/auth/useAuth"
import { useDeleteTimetableEntry, useTimetableEntries } from "@/hooks/useTimetable"
import { sectionsService } from "@/services/sectionsService"
import { academicSessionsService } from "@/services/academicSessionsService"
import { classesService } from "@/services/classesService"
import { periodSlotsService } from "@/services/masterDataService"
import type { TimetableEntryListItem } from "@/types/timetable"

export function TimetablePage() {
  const { can } = useAuth()
  const [viewMode, setViewMode] = useState<TimetableViewMode>("grid")
  const [academicSessionId, setAcademicSessionId] = useState("")
  const [classId, setClassId] = useState("all")
  const [sectionId, setSectionId] = useState("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [editing, setEditing] = useState<TimetableEntryListItem | null>(null)
  const [deleting, setDeleting] = useState<TimetableEntryListItem | null>(null)

  const { data: sections } = useQuery({
    queryKey: ["sections", "by-class", classId],
    queryFn: () =>
      classId !== "all" ? sectionsService.list({ classId }) : Promise.resolve({ items: [], total: 0 }),
    enabled: classId !== "all",
  })
  const classSections = sections?.items ?? []

  const { data, isPending, isError, refetch } = useTimetableEntries({
    academicSessionId: academicSessionId || undefined,
    classId: classId !== "all" ? classId : undefined,
    sectionId: sectionId !== "all" ? sectionId : undefined,
  })

  const { data: periodSlots } = useQuery({
    queryKey: ["period-slots", "options"],
    queryFn: () => periodSlotsService.list({}),
  })

  // Same query keys the toolbar uses, so these resolve from the shared cache
  // rather than adding a request. They only label the printed timetable.
  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions", "options"],
    queryFn: () => academicSessionsService.list({}),
  })
  const { data: classes } = useQuery({
    queryKey: ["classes", "options"],
    queryFn: () => classesService.list({}),
  })

  const entries = data?.items ?? []

  const periodSlotIds = useMemo(() => {
    const ids = (periodSlots?.items ?? []).map((p) => p.id)
    const inUse = new Set((data?.items ?? []).map((e) => e.periodSlotId))
    for (const id of inUse) {
      if (!ids.includes(id)) ids.push(id)
    }
    return ids
  }, [periodSlots, data])

  const canEdit = can("timetable:update")
  const canDelete = can("timetable:delete")
  const canCreate = can("timetable:create")

  // Labels for the printed timetable. Derived from the same cached option lists the
  // toolbar renders, so a printed sheet always states its own scope.
  const session = (sessions?.items ?? []).find((item) => item.id === academicSessionId)
  const klass = (classes?.items ?? []).find((item) => item.id === classId)
  const section = classSections.find((item) => item.id === sectionId)
  const printScope = {
    academicSession: session?.name ?? (academicSessionId ? academicSessionId : "All sessions"),
    className: klass?.name ?? (classId === "all" ? "All classes" : "Selected class"),
    sectionName:
      sectionId === "all" ? "All sections" : (section?.name ?? entries[0]?.sectionName ?? "Selected section"),
  }

  const deleteMutation = useDeleteTimetableEntry()

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId("all")
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
      {/* The screen header — title, print action and Copy Day — is chrome, not
          part of the printed timetable. */}
      <div className="print:hidden">
        <PageHeader
          title="Timetable"
          description="Manage the weekly lesson schedule by class, section, and teacher."
          actions={
            <>
              {/* Decision D5: wide artifacts print landscape. Decision D1: gated on
                  the read permission of the printed artifact. */}
              {can("timetable:view") && (
                <PrintButton
                  documentTitle={`Weekly Timetable ${printScope.className}`}
                  orientation="landscape"
                >
                  Print timetable
                </PrintButton>
              )}
              {canCreate && academicSessionId ? (
                <Button variant="outline" onClick={() => setCopyOpen(true)}>
                  <Copy className="size-4" aria-hidden="true" />
                  Copy Day
                </Button>
              ) : undefined}
            </>
          }
        />
      </div>
        <div className="print:hidden">
        <TimetableToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          academicSessionId={academicSessionId}
          onAcademicSessionChange={setAcademicSessionId}
          classId={classId}
          onClassChange={handleClassChange}
          sectionId={sectionId}
          onSectionChange={setSectionId}
          sections={classSections}
          canCreate={canCreate}
          onCreateClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        />
        </div>
        {viewMode === "grid" ? (
          <div className="print:hidden">
          <TimetableGrid
            items={entries}
            periodSlots={periodSlotIds}
            isPending={isPending}
            isError={isError}
            canEdit={canEdit}
            canDelete={canDelete}
            onRetry={() => void refetch()}
            onEdit={(entry) => {
              setEditing(entry)
              setDialogOpen(true)
            }}
            onDelete={(entry) => setDeleting(entry)}
          />
          </div>
        ) : (
          <div className="print:hidden">
          <TimetableList
            items={entries}
            isPending={isPending}
            isError={isError}
            canEdit={canEdit}
            canDelete={canDelete}
            onRetry={() => void refetch()}
            onEdit={(entry) => {
              setEditing(entry)
              setDialogOpen(true)
            }}
            onDelete={(entry) => setDeleting(entry)}
          />
          </div>
        )}

        <TimetablePrintDocument
          entries={entries}
          periodSlots={periodSlots?.items ?? []}
          scope={printScope}
        />

        <TimetableFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
        <CopyDayDialog
          open={copyOpen}
          onOpenChange={setCopyOpen}
          academicSessionId={academicSessionId}
        />
        <ConfirmDialog
          open={Boolean(deleting)}
          onOpenChange={(open) => {
            if (!open) setDeleting(null)
          }}
          title="Delete timetable entry?"
          description={`This will remove the ${deleting?.subjectName ?? ""} lesson from the timetable. This action cannot be undone.`}
          confirmLabel="Delete entry"
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
