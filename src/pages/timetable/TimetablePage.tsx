import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { TimetableToolbar } from "@/components/timetable/TimetableToolbar"
import type { TimetableViewMode } from "@/components/timetable/TimetableToolbar"
import { TimetableGrid } from "@/components/timetable/TimetableGrid"
import { TimetableList } from "@/components/timetable/TimetableList"
import { TimetableFormDialog } from "@/components/timetable/TimetableFormDialog"
import { CopyDayDialog } from "@/components/timetable/CopyDayDialog"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { useAuth } from "@/auth/useAuth"
import { useDeleteTimetableEntry, useTimetableEntries } from "@/hooks/useTimetable"
import { sectionsService } from "@/services/sectionsService"
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

  const deleteMutation = useDeleteTimetableEntry()

  const handleClassChange = (value: string) => {
    setClassId(value)
    setSectionId("all")
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Timetable"
          description="Manage the weekly lesson schedule by class, section, and teacher."
          actions={
            canCreate && academicSessionId ? (
              <Button variant="outline" onClick={() => setCopyOpen(true)}>
                <Copy className="size-4" aria-hidden="true" />
                Copy Day
              </Button>
            ) : undefined
          }
        />
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
        {viewMode === "grid" ? (
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
        ) : (
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
