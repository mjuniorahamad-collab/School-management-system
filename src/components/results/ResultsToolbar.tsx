import { CheckCircle2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExamStatusBadge } from "@/components/shared/ExamStatusBadge"
import type { ExamListItem } from "@/types/exams"

interface ResultsToolbarProps {
  exams: ExamListItem[]
  selectedExamId: string | null
  canListExams: boolean
  canPublish: boolean
  canFinalize: boolean
  canReopen: boolean
  isActing: boolean
  onSelectExam: (examId: string) => void
  onFinalize: () => void
  onReopen: () => void
}

export function ResultsToolbar({
  exams,
  selectedExamId,
  canListExams,
  canPublish,
  canFinalize,
  canReopen,
  isActing,
  onSelectExam,
  onFinalize,
  onReopen,
}: ResultsToolbarProps) {
  const showActions = canPublish && (canFinalize || canReopen)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full items-center gap-2 sm:max-w-md">
          {canListExams ? (
            <Select value={selectedExamId ?? ""} onValueChange={onSelectExam}>
              <SelectTrigger className="w-full" aria-label="Select examination">
                <SelectValue placeholder="Select an examination…" />
              </SelectTrigger>
              <SelectContent>
                {exams.length === 0 ? (
                  <SelectItem value="__none" disabled>
                    No published or final examinations yet
                  </SelectItem>
                ) : (
                  exams.map((exam) => (
                    <SelectItem key={exam.id} value={exam.id}>
                      {exam.name} — {exam.className}
                      {exam.sectionName ? ` · ${exam.sectionName}` : " · Whole class"}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-muted-foreground">
              Results sheets are managed from the Examinations module.
            </p>
          )}
        </div>
        {showActions && (
          <div className="flex shrink-0 items-center gap-2">
            {canFinalize && (
              <Button onClick={onFinalize} disabled={isActing}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Finalize results
              </Button>
            )}
            {canReopen && (
              <Button variant="outline" onClick={onReopen} disabled={isActing}>
                <RotateCcw className="size-4" aria-hidden="true" />
                Reopen
              </Button>
            )}
          </div>
        )}
      </div>
      {selectedExamId && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ExamStatusBadge status={exams.find((exam) => exam.id === selectedExamId)?.status ?? "DRAFT"} />
          <span>Marks entry opens when an examination is published; finalizing computes grades and ranks.</span>
        </div>
      )}
    </div>
  )
}