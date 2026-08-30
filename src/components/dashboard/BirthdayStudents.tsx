import { Link } from "react-router-dom"
import { ArrowRight, CakeSlice } from "lucide-react"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StudentAvatar } from "@/components/shared/StudentAvatar"
import { useBirthdayStudents } from "@/hooks/useDashboardData"
import { cn } from "@/lib/utils"

interface BirthdayStudentsProps {
  className?: string
}

export function BirthdayStudents({ className }: BirthdayStudentsProps) {
  const { data, isPending, isError } = useBirthdayStudents()

  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Student Birthdays Today</CardTitle>
        <CardDescription data-slot="card-description">
          Wish them a great day
        </CardDescription>
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
          Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b py-3 last:border-0">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}

        {isError && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground">
            Could not load birthdays.
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
                    Class {student.studentClass} · Turning {student.age}
                  </p>
                </div>
                <CakeSlice
                  className="size-4 shrink-0 text-primary/60"
                  aria-label="Birthday today"
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}