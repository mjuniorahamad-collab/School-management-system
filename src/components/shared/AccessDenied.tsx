import { Link } from "react-router-dom"
import { ArrowLeft, ShieldAlert } from "lucide-react"
import { accessibleLandingPath } from "@/auth/routing"
import { useAuth } from "@/auth/useAuth"
import { PageContainer } from "@/components/layout/PageContainer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface AccessDeniedProps {
  requiredPermission?: string
}

export function AccessDenied({ requiredPermission }: AccessDeniedProps) {
  const { user } = useAuth()
  // Loop protection: accessibleLandingPath returns null when the default
  // landing page is denied and portal:view is not effective. In that case we
  // deliberately render no link rather than redirecting back into the guard.
  const landingPath = accessibleLandingPath(user)

  return (
    <PageContainer>
      <Card>
        <CardContent className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <ShieldAlert className="size-10 text-destructive" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-semibold">Access denied</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              You do not have permission to view this page.
              {requiredPermission ? ` Required permission: ${requiredPermission}.` : ""}
            </p>
          </div>
          {landingPath ? (
            <Button asChild variant="outline" className="gap-2">
              <Link to={landingPath}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back to home
              </Link>
            </Button>
          ) : (
            <p className="max-w-md text-sm text-muted-foreground">
              Your account has no accessible landing page. Contact an administrator to review your
              permissions.
            </p>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  )
}
