import { Link } from "react-router-dom"
import { ArrowRight } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { StudentAvatar } from "@/components/shared/StudentAvatar"
import { useRecentStudents } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"

interface RecentStudentsProps {
  className?: string
}

export function RecentStudents({ className }: RecentStudentsProps) {
  const { data, isPending, isError } = useRecentStudents()

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Recent Students</CardTitle>
        <CardDescription data-slot="card-description">Latest activity in the directory</CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link to="/students">
              View all
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {isPending &&
          Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b py-3 last:border-0">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load students. Please try again.
          </div>
        )}

        {data && (
          <ul className="divide-y">
            {data.map((student) => (
              <li key={student.id} className="flex items-center gap-3 py-3">
                <StudentAvatar name={student.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Class {student.studentClass} · {student.section}
                  </p>
                </div>
                <StatusBadge status={student.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <CardFooter className="justify-center border-t pt-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/students">
            View All Students
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}