import { CalendarClock, Pencil, Send, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatFullDate } from "@/lib/format"
import type { NoticeListItem, NoticeStatus } from "@/types/communication"

const statusStyles: Record<NoticeStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 border-transparent dark:bg-slate-500/15 dark:text-slate-300",
  PUBLISHED:
    "bg-emerald-50 text-emerald-700 border-transparent dark:bg-emerald-500/15 dark:text-emerald-300",
  ARCHIVED: "bg-muted text-muted-foreground border-transparent",
}

const audienceLabels: Record<string, string> = {
  EVERYONE: "Everyone",
  STUDENTS: "Students",
  PARENTS: "Parents",
  TEACHERS: "Teachers",
  STAFF: "Staff",
}

const priorityLabels: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
}

const priorityStyles: Record<string, string> = {
  HIGH: "bg-red-50 text-red-700 border-transparent dark:bg-red-500/15 dark:text-red-300",
  MEDIUM: "bg-amber-50 text-amber-700 border-transparent dark:bg-amber-500/15 dark:text-amber-300",
  LOW: "bg-sky-50 text-sky-700 border-transparent dark:bg-sky-500/15 dark:text-sky-300",
}

interface NoticesViewProps {
  items: NoticeListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  onRetry: () => void
  onEdit: (notice: NoticeListItem) => void
  onPublish: (notice: NoticeListItem) => void
  onDelete: (notice: NoticeListItem) => void
}

export function NoticesTable(props: NoticesViewProps) {
  if (props.isPending) return <NoticeSkeleton table />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Title</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Audience</th>
              <th scope="col" className="px-4 py-3 font-medium">Priority</th>
              <th scope="col" className="px-4 py-3 font-medium">Published</th>
              {(props.canEdit || props.canPublish || props.canDelete) && (
                <th scope="col" className="w-32 px-4 py-3" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.items.map((notice) => (
              <tr key={notice.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3 font-medium text-foreground">{notice.title}</td>
                <td className="px-4 py-3">
                  <NoticeStatusBadge status={notice.status as NoticeStatus} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {audienceLabels[notice.audience] ?? notice.audience}
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant="secondary"
                    className={`gap-1.5 font-medium border-transparent ${priorityStyles[notice.priority] ?? ""}`}
                  >
                    {priorityLabels[notice.priority] ?? notice.priority}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {notice.publishedAt ? formatFullDate(notice.publishedAt) : "—"}
                </td>
                {(props.canEdit || props.canPublish || props.canDelete) && (
                  <td className="px-4 py-3">
                    <RowActions {...props} notice={notice} />
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

export function NoticesCards(props: NoticesViewProps) {
  if (props.isPending) return <NoticeSkeleton table={false} />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {props.items.map((notice) => (
        <li key={notice.id}>
          <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{notice.title}</span>
                <NoticeStatusBadge status={notice.status as NoticeStatus} />
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {audienceLabels[notice.audience] ?? notice.audience}
                {" · "}
                {priorityLabels[notice.priority] ?? notice.priority}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <RowActions {...props} notice={notice} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function RowActions({
  notice,
  canEdit,
  canPublish,
  canDelete,
  onEdit,
  onPublish,
  onDelete,
}: {
  notice: NoticeListItem
  canEdit: boolean
  canPublish: boolean
  canDelete: boolean
  onEdit: (notice: NoticeListItem) => void
  onPublish: (notice: NoticeListItem) => void
  onDelete: (notice: NoticeListItem) => void
}) {
  const isDraft = notice.status === "DRAFT"
  return (
    <div className="flex items-center justify-end gap-1">
      {canPublish && isDraft && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onPublish(notice)}
          aria-label={`Publish ${notice.title}`}
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(notice)}
          aria-label={`Edit ${notice.title}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canDelete && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(notice)}
          aria-label={`Delete ${notice.title}`}
          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  )
}

export function NoticeStatusBadge({ status }: { status: NoticeStatus }) {
  return (
    <Badge variant="secondary" className={`border-transparent font-medium ${statusStyles[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <CalendarClock className="size-8 text-muted-foreground/60" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">No notices found</p>
      <p className="text-sm text-muted-foreground">Create a notice to announce it to your school.</p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load notices.</p>
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

function NoticeSkeleton({ table }: { table: boolean }) {
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
