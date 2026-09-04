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
import type { HomeworkListItem } from "@/types/homework"

interface HomeworkDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  homework: HomeworkListItem | null
}

export function HomeworkDetailDialog({ open, onOpenChange, homework }: HomeworkDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{homework?.title}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {homework && <TaskStatusBadge status={homework.status} />}
            {homework?.subjectCode} · {homework?.subjectName}
          </DialogDescription>
        </DialogHeader>
        {homework && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Detail label="Academic session" value={homework.academicSessionName} />
            <Detail
              label="Target"
              value={homework.sectionName ? `${homework.className} · ${homework.sectionName}` : `${homework.className} (whole class)`}
            />
            <Detail label="Teacher" value={homework.teacherName} />
            <Detail
              label="Due date"
              value={
                <span className="flex items-center gap-2">
                  {formatFullDate(homework.dueDate)}
                  {homework.isOverdue && homework.status !== "ARCHIVED" && (
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
              value={homework.publishedAt ? formatFullDate(homework.publishedAt) : "Not yet"}
            />
            <Detail label="Last updated" value={formatFullDate(homework.updatedAt)} />
            <div className="col-span-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">Instructions</p>
              <p className="whitespace-pre-wrap text-foreground">
                {homework.instructions || "No instructions provided."}
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