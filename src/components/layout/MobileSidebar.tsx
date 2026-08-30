import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { SidebarBrand, SidebarNav } from "@/components/layout/SidebarNav"
import { useSidebar } from "@/hooks/useSidebar"
import { branding } from "@/config/branding"

export function MobileSidebar() {
  const { mobileOpen, setMobileOpen } = useSidebar()

  return (
    <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent side="left" className="w-72! gap-0 p-0 sm:w-80!">
        <SheetTitle className="sr-only">
          {branding.schoolName} navigation
        </SheetTitle>
        <div className="flex h-16 shrink-0 items-center border-b">
          <SidebarBrand />
        </div>
        <SidebarNav onNavigate={() => setMobileOpen(false)} />
      </SheetContent>
    </Sheet>
  )
}