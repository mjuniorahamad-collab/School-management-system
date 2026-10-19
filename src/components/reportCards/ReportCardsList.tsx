import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { ReportCardResultBadge, ReportCardStatusBadge } from "@/components/reportCards/ReportCardStatusBadge"
import { formatFullDate } from "@/lib/format"
import {
  describeReportCardScope,
  formatReportCardPercentage,
  reportCardSessionName,
  type ReportCardLabelMaps,
} from "@/lib/reportCardLifecycle"
import type { ReportCardListItem } from "@/types/reportCard"

interface ReportCardsViewProps {
  items: ReportCardListItem[]
  maps: ReportCardLabelMaps
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

/** The frozen overall result, preferring the snapshot and falling back to the row. */
function overallResult(item: ReportCardListItem): string | null {
  return item.snapshot?.overall.result ?? item.overallResult
}

function overallPercentage(item: ReportCardListItem): string | null {
  return item.snapshot?.overall.percentage ?? item.overallPercentage
}

function studentName(item: ReportCardListItem): string {
  return [item.student.firstName, item.student.lastName].filter(Boolean).join(" ")
}

export function ReportCardsTable({ items, maps, isPending, isError, onRetry }: ReportCardsViewProps) {
  if (isPending) return <ReportCardsSkeleton table />
  if (isError) return <ErrorState text="Could not load report cards." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Student</th>
              <th scope="col" className="px-4 py-3 font-medium">Session</th>
              <th scope="col" className="px-4 py-3 font-medium">Class</th>
              <th scope="col" className="px-4 py-3 font-medium">Version</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Overall</th>
              <th scope="col" className="px-4 py-3 font-medium">Created</th>
              <th scope="col" className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr key={item.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3">
                  <Link
                    to={`/report-cards/${item.id}`}
                    className="flex flex-col gap-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="font-medium text-foreground">{studentName(item)}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {item.student.admissionNumber}
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {reportCardSessionName(item.academicSessionId, maps)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {describeReportCardScope(item, maps)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  v{item.version}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <ReportCardStatusBadge status={item.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="flex items-center gap-2">
                    <ReportCardResultBadge result={overallResult(item)} />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatReportCardPercentage(overallPercentage(item))}
                    </span>
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatFullDate(item.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/report-cards/${item.id}`}
                    aria-label={`View report card for ${studentName(item)} version ${item.version}`}
                    className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ReportCardsCards({ items, maps, isPending, isError, onRetry }: ReportCardsViewProps) {
  if (isPending) return <ReportCardsSkeleton table={false} />
  if (isError) return <ErrorState text="Could not load report cards." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            to={`/report-cards/${item.id}`}
            className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                {studentName(item)}
                <ReportCardStatusBadge status={item.status} />
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {item.student.admissionNumber} · v{item.version} · {reportCardSessionName(item.academicSessionId, maps)}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {describeReportCardScope(item, maps)} · {formatReportCardPercentage(overallPercentage(item))}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Created {formatFullDate(item.createdAt)}
              </span>
            </span>
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-foreground">No report cards found</p>
      <p className="text-sm text-muted-foreground">
        Adjust the filters, or generate a report card for a student in this session.
      </p>
    </div>
  )
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
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

function ReportCardsSkeleton({ table }: { table: boolean }) {
  return (
    <div
      className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${table ? "hidden md:block" : "md:hidden"}`}
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
