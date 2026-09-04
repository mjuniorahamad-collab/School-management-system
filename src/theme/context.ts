import { createContext } from "react"

export type Theme = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export interface ThemeContextValue {
  /** The user's chosen mode (may be "system"). */
  theme: Theme
  isDark: boolean
  /** Explicitly sets the mode. */
  setTheme: (theme: Theme) => void
  /** Flips between light and dark (resolves "system" to a concrete mode). */
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)
