import { Banknote, FileBarChart, GraduationCap, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"
import type { ReportCatalogItem, ReportGroup } from "@/types/reports"

const GROUP_ORDER: ReportGroup[] = ["operational", "academic", "financial"]

const GROUP_META: Record<ReportGroup, { label: string; icon: LucideIcon }> = {
  operational: { label: "Operational", icon: Users },
  academic: { label: "Academic", icon: GraduationCap },
  financial: { label: "Financial", icon: Banknote },
}

interface ReportsCatalogProps {
  items: ReportCatalogItem[]
  selectedKey: string | null
  onSelect: (key: string) => void
}

// The catalog is data-driven from GET /reports/catalog, which the server already
// filters to the reports the signed-in actor's permissions allow.
export function ReportsCatalog({ items, selectedKey, onSelect }: ReportsCatalogProps) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
        No reports are available for your account's permissions.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUP_ORDER.map((group) => {
        const groupItems = items.filter((item) => item.group === group)
        if (groupItems.length === 0) return null
        const meta = GROUP_META[group]
        const GroupIcon = meta.icon
        return (
          <section key={group} aria-label={`${meta.label} reports`}>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <GroupIcon className="size-4 text-muted-foreground" aria-hidden="true" />
              {meta.label}
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {groupItems.map((item) => {
                const selected = item.key === selectedKey
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.key)}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors",
                      "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      selected
                        ? "border-primary/40 ring-1 ring-primary/30"
                        : "border-border shadow-card",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <FileBarChart className="size-4 text-primary" aria-hidden="true" />
                      <span className="text-sm font-medium text-foreground">{item.title}</span>
                    </span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}