import { Pencil } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatFullDate } from "@/lib/format"
import { describeSchemeScope, type SchemeScopeNames } from "@/lib/reportCardSchemeScope"
import { AGGREGATION_POLICY_LABELS, OVERALL_PASS_MODE_LABELS } from "@/types/reportCardScheme"
import type { ReportCardSchemeDetail } from "@/types/reportCardScheme"

interface ReportCardSchemesViewProps {
  items: ReportCardSchemeDetail[]
  names: SchemeScopeNames
  isPending: boolean
  isError: boolean
  canEdit: boolean
  onRetry: () => void
  onEdit: (scheme: ReportCardSchemeDetail) => void
}

export function ReportCardSchemesTable({
  items,
  names,
  isPending,
  isError,
  canEdit,
  onRetry,
  onEdit,
}: ReportCardSchemesViewProps) {
  if (isPending) return <SchemesSkeleton table />
  if (isError) return <ErrorState text="Could not load report card schemes." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Scope</th>
              <th scope="col" className="px-4 py-3 font-medium">Aggregation</th>
              <th scope="col" className="px-4 py-3 font-medium">Overall pass</th>
              <th scope="col" className="px-4 py-3 font-medium">Exams</th>
              <th scope="col" className="px-4 py-3 font-medium">Updated</th>
              {canEdit && <th scope="col" className="w-10 px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((scheme) => (
              <tr key={scheme.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3 font-medium text-foreground">
                  <span className="flex items-center gap-2">
                    {describeSchemeScope(scheme, names)}
                    {scheme.sectionId === null && (
                      <Badge variant="secondary" className="border-transparent">
                        Class-level
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {AGGREGATION_POLICY_LABELS[scheme.aggregationPolicy]}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {OVERALL_PASS_MODE_LABELS[scheme.overallPassMode]}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {scheme.exams.length}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatFullDate(scheme.updatedAt)}
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <EditButton scope={describeSchemeScope(scheme, names)} onClick={() => onEdit(scheme)} />
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

export function ReportCardSchemesCards({
  items,
  names,
  isPending,
  isError,
  canEdit,
  onRetry,
  onEdit,
}: ReportCardSchemesViewProps) {
  if (isPending) return <SchemesSkeleton table={false} />
  if (isError) return <ErrorState text="Could not load report card schemes." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((scheme) => (
        <li key={scheme.id}>
          <div className="flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                {describeSchemeScope(scheme, names)}
                {scheme.sectionId === null && (
                  <Badge variant="secondary" className="border-transparent">
                    Class-level
                  </Badge>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {AGGREGATION_POLICY_LABELS[scheme.aggregationPolicy]} ·{" "}
                {OVERALL_PASS_MODE_LABELS[scheme.overallPassMode]} · {scheme.exams.length} exams
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Updated {formatFullDate(scheme.updatedAt)}
              </span>
            </span>
            {canEdit && (
              <EditButton scope={describeSchemeScope(scheme, names)} onClick={() => onEdit(scheme)} />
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function EditButton({ scope, onClick }: { scope: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Edit scheme for ${scope}`}
      className="inline-flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Pencil className="size-4" aria-hidden="true" />
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-foreground">No schemes found</p>
      <p className="text-sm text-muted-foreground">
        Adjust the session or class filters, or create a new scheme.
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

function SchemesSkeleton({ table }: { table: boolean }) {
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
