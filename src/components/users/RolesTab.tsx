import { ShieldCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useRoles } from "@/hooks/useRoles"

export function RolesTab() {
  const { data, isPending, isError, refetch } = useRoles()

  if (isPending) {
    return (
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-72" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load roles.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Roles and their permission grants are defined by the platform and apply across all schools.
          This list shows the roles you can assign to users.
        </p>
      </div>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        {data.map((role) => (
          <li key={role.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{role.name}</p>
              <p className="text-sm text-muted-foreground">{role.description || "No description provided."}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground uppercase">Assignable</span>
          </li>
        ))}
      </ul>
    </div>
  )
}