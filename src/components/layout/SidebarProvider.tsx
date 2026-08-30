import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { SidebarContext, type SidebarContextValue } from "@/context/sidebar"

const STORAGE_KEY = "sms.sidebar.collapsed"

function getInitialCollapsed(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(getInitialCollapsed)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // Storage may be unavailable (private mode) — collapse still works in-session.
    }
  }, [collapsed])

  const setCollapsed = useCallback((value: boolean) => setCollapsedState(value), [])
  const toggleCollapsed = useCallback(() => setCollapsedState((value) => !value), [])

  const value = useMemo<SidebarContextValue>(
    () => ({ collapsed, setCollapsed, toggleCollapsed, mobileOpen, setMobileOpen }),
    [collapsed, setCollapsed, toggleCollapsed, mobileOpen],
  )

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
}