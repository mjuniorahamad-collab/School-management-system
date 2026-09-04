import { CalendarClock, Pencil, Send, Trash2, UserCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { formatFullDate } from "@/lib/format"
import type { AdmissionListItem } from "@/types/admissions"
import { AdmissionStatusBadge } from "./AdmissionStatusBadge"

interface AdmissionsViewProps {
  items: AdmissionListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  canReview: boolean
  canConvert: boolean
  canDelete: boolean
  onRetry: () => void
  onEdit: (application: AdmissionListItem) => void
  onReview: (application: AdmissionListItem) => void
  onConvert: (application: AdmissionListItem) => void
  onDelete: (application: AdmissionListItem) => void
}

export function AdmissionsTable(props: AdmissionsViewProps) {
  if (props.isPending) return <AdmissionSkeleton table />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Applicant</th>
              <th scope="col" className="px-4 py-3 font-medium">Application No.</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Preferred Class</th>
              <th scope="col" className="px-4 py-3 font-medium">Guardian</th>
              <th scope="col" className="px-4 py-3 font-medium">Applied</th>
              {(props.canEdit || props.canReview || props.canConvert || props.canDelete) && (
                <th scope="col" className="w-40 px-4 py-3" />
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {props.items.map((application) => (
              <tr key={application.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{application.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {application.gender}
                    {application.email ? ` · ${application.email}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                  {application.applicationNumber}
                </td>
                <td className="px-4 py-3">
                  <AdmissionStatusBadge status={application.status} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {application.preferredClass
                    ? `${application.preferredClass.name}${application.preferredSection ? `-${application.preferredSection.name}` : ""}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{application.guardianName}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatFullDate(application.createdAt)}
                </td>
                {(props.canEdit || props.canReview || props.canConvert || props.canDelete) && (
                  <td className="px-4 py-3">
                    <RowActions {...props} application={application} />
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

export function AdmissionsCards(props: AdmissionsViewProps) {
  if (props.isPending) return <AdmissionSkeleton table={false} />
  if (props.isError) return <ErrorState onRetry={props.onRetry} />
  if (props.items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {props.items.map((application) => (
        <li key={application.id}>
          <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">
                  {application.name}
                </span>
                <AdmissionStatusBadge status={application.status} />
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">
                {application.applicationNumber}
                {application.preferredClass ? ` · ${application.preferredClass.name}` : ""}
                {" · "}
                {application.guardianName}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <RowActions {...props} application={application} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function RowActions({
  application,
  canEdit,
  canReview,
  canConvert,
  canDelete,
  onEdit,
  onReview,
  onConvert,
  onDelete,
}: {
  application: AdmissionListItem
  canEdit: boolean
  canReview: boolean
  canConvert: boolean
  canDelete: boolean
  onEdit: (application: AdmissionListItem) => void
  onReview: (application: AdmissionListItem) => void
  onConvert: (application: AdmissionListItem) => void
  onDelete: (application: AdmissionListItem) => void
}) {
  const isPending = application.status === "PENDING"
  const isApproved = application.status === "APPROVED"
  return (
    <div className="flex items-center justify-end gap-1">
      {canReview && isPending && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onReview(application)}
          aria-label={`Review ${application.name}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <UserCheck className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canConvert && isApproved && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onConvert(application)}
          aria-label={`Convert ${application.name} to student`}
          className="text-emerald-700 hover:text-emerald-800 dark:text-emerald-300 dark:hover:text-emerald-200"
        >
          <Send className="size-4" aria-hidden="true" />
        </Button>
      )}
      {canEdit && isPending && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(application)}
          aria-label={`Edit ${application.name}`}
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
          onClick={() => onDelete(application)}
          aria-label={`Delete ${application.name}`}
          className="text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
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
      <p className="text-sm font-medium text-foreground">No applications found</p>
      <p className="text-sm text-muted-foreground">
        Start the admission pipeline by adding a new application.
      </p>
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">Could not load applications.</p>
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

function AdmissionSkeleton({ table }: { table: boolean }) {
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
