import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { CalendarClock, Copy } from "lucide-react"
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
  // Viewport-aware *initial* mode only: desktop opens on the grid, narrow
  // widths on the list. No resize listener — once a user picks a mode the
  // toolbar is the single source of truth, and both modes are selectable at
  // every width.
  const [viewMode, setViewMode] = useState<TimetableViewMode>(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "grid"
    return window.matchMedia("(min-width: 1024px)").matches ? "grid" : "list"
  })
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

  const sessionSelected = academicSessionId !== ""
  const { data, isPending, isError, refetch } = useTimetableEntries(
    {
      academicSessionId: academicSessionId || undefined,
      classId: classId !== "all" ? classId : undefined,
      sectionId: sectionId !== "all" ? sectionId : undefined,
    },
    { enabled: sessionSelected },
  )

  // The grid and the printed sheet must LABEL every period slot that an
  // existing entry uses — including a slot that was retired afterwards. The
  // create-form picker (TimetableFormDialog) keeps the active-only default.
  const { data: periodSlots } = useQuery({
    queryKey: ["period-slots", "options", { includeInactive: true }],
    queryFn: () => periodSlotsService.list({ includeInactive: true }),
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
    academicSession: session?.name ?? academicSessionId ?? "Selected session",
    className: klass?.name ?? (classId === "all" ? "All classes" : "Selected class"),
    sectionName:
      sectionId === "all" ? "All sections" : (section?.name ?? entries[0]?.sectionName ?? "Selected section"),
  }
  // The whole-school "All classes" scope prints as the detailed one-row-per-lesson
  // table; a specific class/section keeps the period×weekday grid. An explicit
  // choice, never inferred from the display string above.
  const printLayout = classId === "all" ? "detailed" : "grid"

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
                  the read permission of the printed artifact. Decision A: printing
                  waits for a selected session so no all-session union is ever
                  printed as if it were one week. */}
              {can("timetable:view") && sessionSelected && (
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
        {!sessionSelected ? (
          <SelectSessionPrompt />
        ) : viewMode === "grid" ? (
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
            periodSlots={periodSlots?.items ?? []}
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

        {sessionSelected && (
          <TimetablePrintDocument
            entries={entries}
            periodSlots={periodSlots?.items ?? []}
            scope={printScope}
            layout={printLayout}
          />
        )}

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

/**
 * Shown until an academic session is chosen. The weekly timetable is meaningful
 * for exactly one session, so there is no "all sessions" view, query or print —
 * rendering a union of sessions as if it were one week would be misleading.
 */
function SelectSessionPrompt() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed py-16 text-center">
      <CalendarClock className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">
        Select an academic session to view the timetable.
      </p>
      <p className="text-sm text-muted-foreground">
        The weekly timetable is scoped to a single session.
      </p>
    </div>
  )
}
