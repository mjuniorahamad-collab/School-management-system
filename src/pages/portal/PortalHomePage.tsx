import { Link } from "react-router-dom"
import { ChevronRight, Megaphone, School } from "lucide-react"
import { usePortalOverview } from "@/hooks/usePortal"
import { PageContainer } from "@/components/layout/PageContainer"
import { Badge } from "@/components/ui/badge"
import { getInitials } from "@/lib/format"

export function PortalHomePage() {
  const { data, isLoading, isError } = usePortalOverview()

  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <School className="size-4" aria-hidden="true" />
          {data?.school.name ?? "Student & Parent Portal"}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {isLoading ? "Loading…" : `Welcome back, ${data?.name}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          Academic records, fees, results and school updates for your linked children.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">Your children</h2>
          <Link
            to="/portal/notices"
            className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Megaphone className="size-4" aria-hidden="true" />
            Notices
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : isError || !data ? (
          <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            Could not load your portal. Check the school server and try again.
          </p>
        ) : data.children.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No children are linked to this account yet. Contact the school office to link your profile.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.children.map((child) => (
              <Link
                key={child.id}
                to={`/portal/${child.id}`}
                className="group flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                      {getInitials(child.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{child.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{child.admissionNumber}</p>
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {child.enrollment ? (
                    <>
                      <Badge variant="outline">{child.enrollment.className}</Badge>
                      {child.enrollment.sectionName && <Badge variant="outline">{child.enrollment.sectionName}</Badge>}
                      <span className="text-muted-foreground">{child.enrollment.academicSessionName}</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">No active enrollment</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  )
}