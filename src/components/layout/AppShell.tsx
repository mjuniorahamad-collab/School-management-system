import { Outlet } from "react-router-dom"
import { Sidebar } from "@/components/layout/Sidebar"
import { MobileSidebar } from "@/components/layout/MobileSidebar"
import { TopHeader } from "@/components/layout/TopHeader"
import { SidebarProvider } from "@/components/layout/SidebarProvider"

export function AppShell() {
  return (
    <SidebarProvider>
      <div className="flex h-dvh w-full overflow-hidden">
        <MobileSidebar />
        <Sidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TopHeader />
          <main className="flex-1 overflow-y-auto [overflow-anchor:none]" id="main-content">
            <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  )
}