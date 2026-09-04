import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { TaskStatusBadge } from "@/components/shared/TaskStatusBadge"
import { formatFullDate } from "@/lib/format"
import type { AssignmentListItem } from "@/types/assignments"

interface AssignmentsDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  assignment: AssignmentListItem | null
}

export function AssignmentsDetailDialog({ open, onOpenChange, assignment }: AssignmentsDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{assignment?.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {assignment && <TaskStatusBadge status={assignment.status} />}
            {assignment?.subjectCode} · {assignment?.subjectName}
          </DialogDescription>
        </DialogHeader>
        {assignment && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail label="Academic session" value={assignment.academicSessionName} />
            <Detail
              label="Target"
              value={assignment.sectionName ? `${assignment.className} · ${assignment.sectionName}` : `${assignment.className} (whole class)`}
            />
            <Detail label="Teacher" value={assignment.teacherName} />
            <Detail
              label="Due date"
              value={
                <span className="flex items-center gap-2">
                  {formatFullDate(assignment.dueDate)}
                  {assignment.isOverdue && assignment.status !== "ARCHIVED" && (
                    <Badge
                      variant="secondary"
                      className="border-transparent bg-red-50 font-medium text-red-700 dark:bg-red-500/15 dark:text-red-300"
                    >
                      Overdue
                    </Badge>
                  )}
                </span>
              }
            />
            <Detail
              label="Published"
              value={assignment.publishedAt ? formatFullDate(assignment.publishedAt) : "Not yet"}
            />
            <Detail label="Last updated" value={formatFullDate(assignment.updatedAt)} />
            <div className="col-span-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Instructions</p>
              <p className="whitespace-pre-wrap text-foreground">
                {assignment.instructions || "No instructions provided."}
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value}</p>
    </div>
  )
}