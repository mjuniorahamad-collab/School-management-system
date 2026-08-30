import { createContext } from "react"

export interface SidebarContextValue {
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  toggleCollapsed: () => void
  mobileOpen: boolean
  setMobileOpen: (value: boolean) => void
}

export const SidebarContext = createContext<SidebarContextValue | null>(null)