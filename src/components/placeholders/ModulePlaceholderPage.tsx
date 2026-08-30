import { Link } from "react-router-dom"
import { ArrowLeft, Construction } from "lucide-react"
import { Breadcrumbs } from "@/components/layout/Breadcrumbs"
import { PageContainer } from "@/components/layout/PageContainer"
import { PageHeader } from "@/components/layout/PageHeader"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { findNavItem } from "@/routes/navigation"
import type { ModuleMeta, ModuleStatus } from "@/types"

const statusMeta: Record<ModuleStatus, { label: string; className: string }> = {
  planned: { label: "Not implemented yet", className: "bg-amber-50 text-amber-700 border-transparent" },
  "in-progress": { label: "In progress", className: "bg-sky-50 text-sky-700 border-transparent" },
  ready: { label: "Available", className: "bg-emerald-50 text-emerald-700 border-transparent" },
}

export function ModulePlaceholderPage({ module }: { module: ModuleMeta }) {
  const navItem = findNavItem(module.path)
  const status = statusMeta[module.status]
  const Icon = navItem?.icon ?? Construction

  return (
    <PageContainer>
      <Breadcrumbs paths={[{ label: "Home", to: "/dashboard" }, { label: module.label }]} />
      <PageHeader
        title={module.label}
        description={module.purpose}
        actions={
          <Badge variant="secondary" className={status.className}>
            {status.label}
          </Badge>
        }
      />

      <Card>
        <CardContent className="flex flex-col items-start gap-5 px-6 py-8 sm:px-8">
          <div className="flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Icon className="size-6" aria-hidden="true" />
          </div>
          <div className="max-w-2xl">
            <h2 className="text-base font-semibold">Module foundation ready</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              This area is wired into navigation and routing, but the{" "}
              <span className="font-medium text-foreground">{module.label}</span> module has not
              been implemented in the current milestone.
            </p>
          </div>
          <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Purpose
              </p>
              <p className="mt-1.5 text-sm">{module.purpose}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Future connection point
              </p>
              <p className="mt-1.5 text-sm">{module.futureConnection}</p>
            </div>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/dashboard">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  )
}