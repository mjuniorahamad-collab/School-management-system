import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { Loader2, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/auth/useAuth"
import { defaultLandingPath } from "@/auth/routing"
import { branding } from "@/config/branding"
import { ApiClientError } from "@/lib/apiClient"
import { useActivatePortalAccount } from "@/hooks/usePortal"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function InvalidLinkCard({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center gap-3 pb-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Activation link problem</CardTitle>
            <CardDescription>{message}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * Public one-time activation page for a freshly provisioned portal account.
 * The parent opens the link the school sent, chooses a password, and is signed
 * in automatically (same session mechanics as a normal login).
 */
export function ActivatePortalPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")?.trim() ?? ""
  const { user, isLoading, signIn } = useAuth()
  const navigate = useNavigate()
  const activate = useActivatePortalAccount()

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const passwordError = useMemo(() => {
    if (!password) return null
    if (password.length < 8) return "Password must be at least 8 characters"
    if (password.length > 200) return "Password must be 200 characters or fewer"
    if (confirmPassword && password !== confirmPassword) return "Passwords do not match"
    return null
  }, [password, confirmPassword])

  if (!isLoading && user) {
    return <Navigate to={defaultLandingPath(user)} replace />
  }

  if (!token) {
    return (
      <InvalidLinkCard message="This page needs a valid activation link. Ask the school office to send you a new one." />
    )
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters")
      return
    }
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match")
      return
    }

    setSubmitting(true)
    try {
      const result = await activate.mutateAsync({ token, newPassword: password })
      // Establish the client session through the standard login path so the
      // identity cache and cookies are exactly as a normal sign-in would leave
      // them (the activation endpoint already issued a session server-side).
      const signedIn = await signIn({ email: result.user.email, password })
      toast.success("Portal activated", { description: "Welcome — you are now signed in." })
      navigate(defaultLandingPath(signedIn), { replace: true })
    } catch (error) {
      const message =
        error instanceof ApiClientError && error.message
          ? error.message
          : "We could not activate this link. Please try again."
      setErrorMessage(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center gap-3 pb-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground shadow-card">
            {branding.schoolInitials}
          </div>
          <div className="space-y-1">
            <CardTitle className="text-xl">Set your portal password</CardTitle>
            <CardDescription>
              Choose a password for {branding.schoolName} to finish setting up your account.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            {(errorMessage || passwordError) && (
              <p
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
              >
                {errorMessage ?? passwordError}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={submitting || Boolean(passwordError)}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Activating…
                </>
              ) : (
                "Activate & sign in"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}