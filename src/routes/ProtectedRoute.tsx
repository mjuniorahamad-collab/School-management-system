import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-muted">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Loading your session…</p>
    </div>
  )
}

function AuthErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted px-4">
      <p className="max-w-md text-center text-sm text-muted-foreground">
        We couldn't reach the school server. Check that the API is running, then try again.
      </p>
      <Button onClick={onRetry}>Try again</Button>
    </div>
  )
}

/** Guards the app shell: unauthenticated users are sent to /login with a return path. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading, isError, refetch } = useAuth()
  const location = useLocation()

  if (isLoading) return <AuthLoadingScreen />
  if (isError) return <AuthErrorScreen onRetry={refetch} />

  if (!user) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to="/login" replace state={{ from }} />
  }

  return <>{children}</>
}