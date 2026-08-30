import { NavLink } from "react-router-dom"
import { ChevronRight } from "lucide-react"
import { findNavItem } from "@/routes/navigation"
import { cn } from "@/lib/utils"

interface BreadcrumbsProps {
  paths: { label: string; to?: string }[]
}

export function Breadcrumbs({ paths }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {paths.map((path, index) => {
        const isLast = index === paths.length - 1
        const navItem = findNavItem(path.to ?? "")
        const label = navItem?.label ?? path.label
        return (
          <span key={`${label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight className="size-3.5 text-muted-foreground/60" aria-hidden="true" />
            )}
            {!isLast && path.to ? (
              <NavLink
                to={path.to}
                className="hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
              >
                {label}
              </NavLink>
            ) : (
              <span
                className={cn("font-medium text-foreground", isLast && "text-muted-foreground")}
                aria-current={isLast ? "page" : undefined}
              >
                {label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}