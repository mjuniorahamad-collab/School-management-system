import { Archive, CalendarClock, Pencil, Send, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ExamStatusBadge } from "@/components/shared/ExamStatusBadge"
import { formatFullDate } from "@/lib/format"
import type { ExamListItem } from "@/types/exams"

interface ExaminationViewProps {
  items: ExamListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  onRetry: () => void
  onView: (exam: ExamListItem) => void
  onEdit: (exam: ExamListItem) => void
  onPublish: (exam: ExamListItem) => void
  onArchive: (exam: ExamListItem) => void
  onDelete: (exam: ExamListItem) => void
}

export function ExaminationTable(props: ExaminationViewProps) {
  if (props.isPending) return <ExaminationSkeleton table />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Examination</th>
              <th scope="col" className="px-4 py-3 font-medium">Target</th>
              <th scope="col" className="px-4 py-3 font-medium">Dates</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              {(props.canEdit || props.canPublish || props.canDelete) && (
                <th scope="col" className="w-44 px-4 py-3" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.items.map((exam) => (
              <tr
                key={exam.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => props.onView(exam)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{exam.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam.examTypeCode} · {exam.academicSessionName}
                  </p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {exam.className}
                  {exam.sectionName ? ` · ${exam.sectionName}` : " · Whole class"}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatFullDate(exam.startDate)} – {formatFullDate(exam.endDate)}
                </td>
                <td className="px-4 py-3">
                  <ExamStatusBadge status={exam.status} />
                </td>
                {(props.canEdit || props.canPublish || props.canDelete) && (
                  <td className="px-4 py-3">
                    <RowActions {...props} exam={exam} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ExaminationCards(props: ExaminationViewProps) {
  if (props.isPending) return <ExaminationSkeleton table={false} />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {props.items.map((exam) => (
        <li key={exam.id}>
          <button
            type="button"
            onClick={() => props.onView(exam)}
            className="w-full rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40"
          >
            <span className="flex items-start gap-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{exam.name}</span>
                  <ExamStatusBadge status={exam.status} />
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {exam.examTypeCode} · {exam.className}
                  {exam.sectionName ? ` · ${exam.sectionName}` : " · Whole class"}
                </span>
                <span className="mt-2 block text-xs text-muted-foreground">
                  {formatFullDate(exam.startDate)} – {formatFullDate(exam.endDate)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <RowActions {...props} exam={exam} />
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function RowActions({
  exam,
  canEdit,
  canPublish,
  canDelete,
  onEdit,
  onPublish,
  onArchive,
  onDelete,
}: {
  exam: ExamListItem
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  onEdit: (exam: ExamListItem) => void
  onPublish: (exam: ExamListItem) => void
  onArchive: (exam: ExamListItem) => void
  onDelete: (exam: ExamListItem) => void
}) {
  const isDraft = exam.status === "DRAFT"
  const isLive = exam.status === "DRAFT" || exam.status === "PUBLISHED"
  return (
    <div className="flex items-center justify-end gap-1">
      {canPublish && isDraft && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onPublish(exam) }}
          aria-label={`Publish ${exam.name}`}
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onEdit(exam) }}
          disabled={!isDraft}
          aria-label={`Edit ${exam.name}`}
          className="text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canEdit && isLive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onArchive(exam) }}
          aria-label={`Archive ${exam.name}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Archive className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(e) => { e.stopPropagation(); onDelete(exam) }}
          disabled={!isDraft}
          aria-label={`Delete ${exam.name}`}
          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400 disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <CalendarClock className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No examinations found</p>
      <p className="text-sm text-muted-foreground">
        Create an examination to schedule a test cycle for a class.
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load examinations.</p>
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

function ExaminationSkeleton({ table }: { table: boolean }) {
  return (
    <div
      className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${table ? "hidden md:block" : "md:hidden"}`}
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}