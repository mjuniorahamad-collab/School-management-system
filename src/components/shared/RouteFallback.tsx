import { Loader2 } from "lucide-react"

/**
 * Full-page loading fallback shown while a lazy-loaded route chunk is fetched
 * and evaluated. It intentionally renders outside the auth/shell layout so a
 * direct navigation to a protected route shows a neutral, non-flashing loader.
 */
export function RouteFallback() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-muted">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  )
}
