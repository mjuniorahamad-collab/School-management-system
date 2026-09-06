import { Badge } from "@/components/ui/badge"
import type {
  PortalAttendanceRecord,
  PortalInstallmentView,
  PortalTaskView,
} from "@/types/portal"

export function AttendanceStatusBadge({ status }: { status: PortalAttendanceRecord["status"] }) {
  const styles: Record<PortalAttendanceRecord["status"], { label: string; className: string }> = {
    PRESENT: { label: "Present", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
    ABSENT: { label: "Absent", className: "bg-destructive/10 text-destructive" },
    LATE: { label: "Late", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
    HOLIDAY: { label: "Holiday", className: "bg-sky-500/10 text-sky-700 dark:text-sky-300" },
  }
  const style = styles[status]
  return <Badge variant="outline" className={style.className}>{style.label}</Badge>
}

export function InvoiceStatusBadge({ status }: { status: PortalInstallmentView["status"] }) {
  const styles: Record<PortalInstallmentView["status"], { label: string; className: string }> = {
    PAID: { label: "Paid", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
    PARTIAL: { label: "Partial", className: "bg-amber-500/10 text-amber-700 dark:text-amber-300" },
    UNPAID: { label: "Unpaid", className: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
    OVERDUE: { label: "Overdue", className: "bg-destructive/10 text-destructive" },
  }
  const style = styles[status]
  return <Badge variant="outline" className={style.className}>{style.label}</Badge>
}

export function TaskStatusBadge({ status }: { status: PortalTaskView["status"] }) {
  const styles: Record<PortalTaskView["status"], { label: string; className: string }> = {
    PUBLISHED: { label: "Published", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
    DRAFT: { label: "Draft", className: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
    ARCHIVED: { label: "Archived", className: "bg-slate-500/10 text-slate-700 dark:text-slate-300" },
  }
  const style = styles[status]
  return <Badge variant="outline" className={style.className}>{style.label}</Badge>
}

export function TaskKindBadge({ kind }: { kind: PortalTaskView["kind"] }) {
  if (kind === "HOMEWORK") return <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300">Homework</Badge>
  return <Badge className="bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">Assignment</Badge>
}