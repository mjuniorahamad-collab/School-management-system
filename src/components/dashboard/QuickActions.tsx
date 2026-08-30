import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/auth/useAuth"
import { AddTeacherDialog } from "@/components/dialogs/AddTeacherDialog"
import { MarkAttendanceDialog } from "@/components/dialogs/MarkAttendanceDialog"
import { CollectFeeDialog } from "@/components/dialogs/CollectFeeDialog"
import { CreateNoticeDialog } from "@/components/dialogs/CreateNoticeDialog"
import { GenerateReportDialog } from "@/components/dialogs/GenerateReportDialog"
import { useQuickActions } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"

interface QuickActionsProps {
  className?: string
}

export function QuickActions({ className }: QuickActionsProps) {
  const { data, isPending, isError } = useQuickActions()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [openDialog, setOpenDialog] = useState<string | null>(null)

  const inlineBase = `inline-flex items-center justify-center gap-2.5 rounded-xl border bg-card p-3 text-sm font-medium shadow-card transition-colors hover:bg-muted/50 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`

  const handleActionClick = (id: string | undefined) => {
    if (id === "add-student") {
      navigate("/students/new")
      return
    }
    setOpenDialog(id ?? null)
  }

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription data-slot="card-description">Common daily operations</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-[58px] rounded-xl" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load quick actions.
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {data
              .filter((action) => action.id !== "add-student" || can("students:create"))
              .map((action) => {
                const Icon = action.icon
                return (
                  <button
                    key={action.id}
                    type="button"
                    className={inlineBase}
                    onClick={() => handleActionClick(action.id)}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Icon className="size-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-sm font-medium">{action.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {action.description}
                      </span>
                    </span>
                  </button>
                )
              })}
          </div>
        )}
      </CardContent>

      <AddTeacherDialog
        open={openDialog === "add-teacher"}
        onOpenChange={(open) => setOpenDialog(open ? "add-teacher" : null)}
      />
      <MarkAttendanceDialog
        open={openDialog === "mark-attendance"}
        onOpenChange={(open) => setOpenDialog(open ? "mark-attendance" : null)}
      />
      <CollectFeeDialog
        open={openDialog === "collect-fees"}
        onOpenChange={(open) => setOpenDialog(open ? "collect-fees" : null)}
      />
      <CreateNoticeDialog
        open={openDialog === "create-notice"}
        onOpenChange={(open) => setOpenDialog(open ? "create-notice" : null)}
      />
      <GenerateReportDialog
        open={openDialog === "generate-report"}
        onOpenChange={(open) => setOpenDialog(open ? "generate-report" : null)}
      />
    </Card>
  )
}