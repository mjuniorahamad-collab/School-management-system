import { Megaphone } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { usePortalNotices } from "@/hooks/usePortal"
import { PageContainer } from "@/components/layout/PageContainer"
import { formatFullDate } from "@/lib/format"
import type { PortalNoticeView } from "@/types/portal"

const PRIORITY_LABELS: Record<PortalNoticeView["priority"], string> = {
  HIGH: "High priority",
  MEDIUM: "Medium",
  LOW: "Low",
}

export function PortalNoticesPage() {
  const { data, isLoading, isError } = usePortalNotices()

  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Notices</h1>
        <p className="text-sm text-muted-foreground">Official announcements from {data ? "the school" : "your school"}.</p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : isError || !data ? (
        <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">Could not load notices.</p>
      ) : data.notices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <Megaphone className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">No notices have been published yet.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.notices.map((notice: PortalNoticeView) => (
            <li key={notice.id} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{notice.title}</p>
                <Badge
                  variant="outline"
                  className={
                    notice.priority === "HIGH"
                      ? "bg-destructive/10 text-destructive"
                      : notice.priority === "MEDIUM"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-muted text-muted-foreground"
                  }
                >
                  {PRIORITY_LABELS[notice.priority]}
                </Badge>
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">{notice.body}</p>
              <p className="text-xs text-muted-foreground">
                {notice.publishedAt ? `Published ${formatFullDate(notice.publishedAt)}` : "Draft"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  )
}