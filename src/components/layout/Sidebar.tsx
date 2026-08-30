import { ChevronLeft, ChevronRight } from "lucide-react"
import { useSidebar } from "@/hooks/useSidebar"
import { SidebarBrand, SidebarNav } from "@/components/layout/SidebarNav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function Sidebar() {
  const { collapsed, toggleCollapsed } = useSidebar()

  return (
    <aside
      className={cn(
        "bg-sidebar text-sidebar-foreground hidden h-full shrink-0 flex-col border-r transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className="flex h-16 shrink-0 items-center border-b">
        <SidebarBrand collapsed={collapsed} />
      </div>

      <SidebarNav collapsed={collapsed} />

      <div className="shrink-0 border-t p-3">
        {collapsed ? (
          <Button
            variant="ghost"
            size="icon"
            className="mx-auto flex"
            onClick={toggleCollapsed}
            aria-label="Expand sidebar"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={toggleCollapsed}
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span>Collapse</span>
          </Button>
        )}
      </div>
    </aside>
  )
}