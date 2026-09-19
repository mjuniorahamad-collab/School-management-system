import { NavLink } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { branding } from "@/config/branding"
import { useBranding } from "@/hooks/useBranding"
import { navigationSections } from "@/routes/navigation"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarNavProps {
  collapsed?: boolean
  onNavigate?: () => void
}

export function SidebarBrand({ collapsed }: { collapsed?: boolean }) {
  const { data } = useBranding()
  const schoolName = data?.schoolName || branding.schoolName
  const schoolTagline = data?.tagline || branding.schoolTagline

  return (
    <div className={cn("flex items-center gap-3 px-5", collapsed && "justify-center px-0")}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-card">
        {branding.schoolInitials}
      </div>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="line-clamp-2 text-sm font-semibold">{schoolName}</p>
          <p className="truncate text-xs text-muted-foreground">{schoolTagline}</p>
        </div>
      )}
    </div>
  )
}

export function SidebarSectionLabel({ children }: { children: string }) {
  return (
    <p className="px-5 pb-1.5 pt-5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </p>
  )
}

export function SidebarNav({ collapsed = false, onNavigate }: SidebarNavProps) {
  const { can } = useAuth()

  const sections = navigationSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.requiredPermission || can(item.requiredPermission)),
    }))
    .filter((section) => section.items.length > 0)

  return (
    <nav className="flex flex-1 flex-col overflow-y-auto px-3 pb-4" aria-label="Main navigation">
      {sections.map((section) => (
        <div key={section.id}>
          {collapsed ? (
            <div className="mx-auto my-3 h-px w-8 bg-border" aria-hidden="true" />
          ) : (
            <SidebarSectionLabel>{section.label}</SidebarSectionLabel>
          )}
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const Icon = item.icon
              const link = (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onNavigate}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none",
                    "aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-semibold aria-[current=page]:text-primary",
                    collapsed && "justify-center px-0",
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              )
              return collapsed ? (
                <Tooltip key={item.path}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12} className="ml-1">
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              ) : (
                link
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}