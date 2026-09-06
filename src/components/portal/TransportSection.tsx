import { Bus } from "lucide-react"
import { usePortalTransport } from "@/hooks/usePortal"
import { formatFullDate } from "@/lib/format"
import type { PortalTransportAssignmentView } from "@/types/portal"

const DIRECTION_LABELS: Record<PortalTransportAssignmentView["direction"], string> = {
  TO_SCHOOL: "To school",
  FROM_SCHOOL: "From school",
  BOTH: "Both ways",
}

export function TransportSection({ studentId }: { studentId: string }) {
  const { data, isLoading, isError } = usePortalTransport(studentId)

  if (isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" />
  }
  if (isError || !data) {
    return <p className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">Could not load transport details.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-md bg-muted px-2 py-1 font-medium text-foreground">{data.session.name}</span>
        <span>
          {data.student.name} · {data.student.admissionNumber}
        </span>
      </div>

      {data.assignments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-10 text-center">
          <Bus className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No transport assignment for this session.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.assignments.map((assignment: PortalTransportAssignmentView) => (
            <li key={assignment.id} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bus className="size-4" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{assignment.routeName}</p>
                  <p className="text-xs text-muted-foreground">Stop: {assignment.stopName} · {DIRECTION_LABELS[assignment.direction]}</p>
                </div>
              </div>
              <div className="shrink-0 sm:text-right">
                <p className="text-xs text-muted-foreground">Assigned {formatFullDate(assignment.assignedAt)}</p>
                {assignment.notes && <p className="mt-0.5 text-xs text-muted-foreground">{assignment.notes}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}