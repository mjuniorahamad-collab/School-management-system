import { useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { ResultSheetGrid } from "@/components/results/ResultSheetGrid"
import { ResultsToolbar } from "@/components/results/ResultsToolbar"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"
import { useExamList } from "@/hooks/useExams"
import { useFinalizeExam, usePutSubjectMarks, useReopenExam, useResultSheet } from "@/hooks/useResults"
import { formatFullDate } from "@/lib/format"
import type { MarksRowInput } from "@/types/results"

type PendingAction = "finalize" | "reopen" | null

export function ResultsPage() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedExamId = searchParams.get("exam")
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const canView = can("results:view")
  const canPublish = can("results:publish")
  const canListExams = can("exams:view")

  const examsQuery = useExamList({ page: 1, pageSize: 100 })
  const availableExams = useMemo(
    () =>
      (examsQuery.data?.items ?? []).filter(
        (exam) => exam.status === "PUBLISHED" || exam.status === "FINAL",
      ),
    [examsQuery.data],
  )

  const sheetQuery = useResultSheet(selectedExamId)
  const saveMarks = usePutSubjectMarks(selectedExamId)
  const finalizeMutation = useFinalizeExam(selectedExamId)
  const reopenMutation = useReopenExam(selectedExamId)
  const isActing = saveMarks.isPending || finalizeMutation.isPending || reopenMutation.isPending

  const selectExam = (examId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set("exam", examId)
    setSearchParams(next, { replace: false })
  }

  const data = sheetQuery.data
  const sheet = data ?? null
  const canFinalize = Boolean(selectedExamId && sheet?.canFinalize)
  const canReopen = Boolean(selectedExamId && sheet?.canReopen)

  function handleSaveSubject(examSubjectId: string, rows: MarksRowInput[]) {
    saveMarks.mutate({ examSubjectId, rows })
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <PageHeader
          title="Results"
          description="Enter marks for published examinations, finalize grade sheets, and reopen for corrections."
        />
        <ResultsToolbar
          exams={availableExams}
          selectedExamId={selectedExamId}
          canListExams={canListExams}
          canPublish={canPublish}
          canFinalize={canFinalize}
          canReopen={canReopen}
          isActing={isActing}
          onSelectExam={selectExam}
          onFinalize={() => setPendingAction("finalize")}
          onReopen={() => setPendingAction("reopen")}
        />

        {!canView ? (
          <EmptyState message="You do not have permission to view results." />
        ) : !selectedExamId ? (
          <EmptyState message="Choose a published or finalized examination from the list above." />
        ) : sheetQuery.isPending ? (
          <SheetSkeleton />
        ) : sheetQuery.isError ? (
          <ErrorState onRetry={() => void sheetQuery.refetch()} />
        ) : sheet ? (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10 sm:grid-cols-4">
              <MetaCard label="Examination" value={sheet.exam.name} />
              <MetaCard
                label="Target"
                value={`${sheet.exam.className}${sheet.exam.sectionName ? ` · ${sheet.exam.sectionName}` : " · Whole class"}`}
              />
              <MetaCard label="Dates" value={`${formatFullDate(sheet.exam.startDate)} – ${formatFullDate(sheet.exam.endDate)}`} />
              <MetaCard
                label="Finalized"
                value={sheet.exam.finalizedAt ? formatFullDate(sheet.exam.finalizedAt) : "Not yet"}
              />
            </div>
            {sheet.rows.length === 0 ? (
              <EmptyState message="No students are enrolled in this examination's class." />
            ) : (
              <ResultSheetGrid sheet={sheet} isSaving={isActing} onSaveSubject={handleSaveSubject} />
            )}
          </>
        ) : null}

        <ConfirmDialog
          open={pendingAction === "finalize"}
          onOpenChange={(open) => { if (!open) setPendingAction(null) }}
          title="Finalize results?"
          description="Finalizing freezes marks, computes overall grades, and sets competition ranks. You can reopen later to correct mistakes."
          confirmLabel="Finalize results"
          isPending={finalizeMutation.isPending}
          onConfirm={() => {
            finalizeMutation.mutate(undefined, { onSuccess: () => setPendingAction(null) })
          }}
        />
        <ConfirmDialog
          open={pendingAction === "reopen"}
          onOpenChange={(open) => { if (!open) setPendingAction(null) }}
          title="Reopen examination?"
          description="Reopening clears all ranks and returns the exam to published so marks can be corrected."
          confirmLabel="Reopen"
          isPending={reopenMutation.isPending}
          onConfirm={() => {
            reopenMutation.mutate(undefined, { onSuccess: () => setPendingAction(null) })
          }}
        />

        <p className="text-xs text-muted-foreground">
          Absences are excluded rather than counted as zero; overall grades and ranks appear once every subject has
          marks for a student.
        </p>
      </div>
    </PageContainer>
  )
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 font-medium text-foreground">{value}</p>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load the results sheet.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Try again
      </button>
    </div>
  )
}

function SheetSkeleton() {
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  )
}