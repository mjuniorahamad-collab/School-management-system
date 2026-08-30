import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { PageContainer } from "@/components/layout/PageContainer"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export function NotFoundPage() {
  return (
    <PageContainer>
      <Card>
        <CardContent className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
          <p className="text-5xl font-semibold tracking-tight text-primary">404</p>
          <div>
            <h1 className="text-lg font-semibold">Page not found</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              The page you are looking for doesn't exist or has moved.
            </p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/dashboard">
              <ArrowLeft className="size-4" aria-hidden="true" />
              Back to dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </PageContainer>
  )
}