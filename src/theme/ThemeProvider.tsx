import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { ThemeContext, type ResolvedTheme, type Theme } from "@/theme/context"

const STORAGE_KEY = "sms.theme"

function prefersDarkMedia(): MediaQueryList | undefined {
  if (typeof window === "undefined") return undefined
  return window.matchMedia("(prefers-color-scheme: dark)")
}

/** Resolves the user's effective mode to a concrete light/dark value. */
function resolveTheme(theme: Theme, os: boolean): ResolvedTheme {
  return theme === "system" ? (os ? "dark" : "light") : theme
}

function applyClass(className: string, isDark: boolean): void {
  document.documentElement.classList.toggle(className, isDark)
}

function readStoredTheme(): Theme | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" || value === "system" ? value : null
  } catch {
    return null
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? "system")
  const [osDark, setOsDark] = useState<boolean>(() => prefersDarkMedia()?.matches ?? false)

  const isDark = resolveTheme(theme, osDark) === "dark"

  useEffect(() => {
    applyClass("dark", isDark)
  }, [isDark])

  useEffect(() => {
    const media = prefersDarkMedia()
    if (!media) return
    const onChange = (event: MediaQueryListEvent) => setOsDark(event.matches)
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Storage may be unavailable (private mode) — theme still applies for the session.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(isDark ? "light" : "dark")
  }, [isDark, setTheme])

  const value = useMemo(
    () => ({ theme, isDark, setTheme, toggleTheme }),
    [theme, isDark, setTheme, toggleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export { STORAGE_KEY }
