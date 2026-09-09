import { ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { StudentAvatar } from "@/components/shared/StudentAvatar"
import { StudentStatusBadge } from "@/components/students/StudentStatusBadge"
import { formatFullDate } from "@/lib/format"
import { photoDisplayUrl } from "@/lib/photoUrl"
import type { StudentListItem } from "@/types/students"

interface StudentsViewProps {
  items: StudentListItem[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
}

export function StudentsTable({ items, isPending, isError, onRetry }: StudentsViewProps) {
  const navigate = useNavigate()

  if (isPending) return <StudentsTableSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm text-muted-foreground">Could not load students.</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
        >
          Try again
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
        <p className="text-sm font-medium text-foreground">No students found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting the search or filters, or add a new student.
        </p>
      </div>
    )
  }

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Student</th>
              <th scope="col" className="px-4 py-3 font-medium">Class</th>
              <th scope="col" className="px-4 py-3 font-medium">Guardian</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Admission</th>
              <th scope="col" className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((student) => (
              <tr
                key={student.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => navigate(`/students/${student.id}`)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <StudentAvatar
                      name={student.name}
                      photoUrl={photoDisplayUrl("students", student.id, student.photoUrl)}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{student.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {student.admissionNumber}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {student.class ? (
                    <>
                      <span className="font-medium text-foreground">Class {student.class.name}</span>
                      <span className="text-muted-foreground"> · {student.section?.name}</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unplaced</span>
                  )}
                </td>
                <td className="max-w-52 px-4 py-3">
                  {student.primaryGuardian ? (
                    <span className="block truncate text-foreground">
                      {student.primaryGuardian.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <StudentStatusBadge status={student.status} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {formatFullDate(student.admissionDate)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <ChevronRight className="size-4" aria-hidden="true" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StudentsCards({ items, isPending, isError, onRetry }: StudentsViewProps) {
  const navigate = useNavigate()

  if (isPending) return <StudentsCardsSkeleton />

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center md:hidden">
        <p className="text-sm text-muted-foreground">Could not load students.</p>
        <button
          type="button"
          onClick={onRetry}
          className="text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded"
        >
          Try again
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center md:hidden">
        <p className="text-sm font-medium text-foreground">No students found</p>
        <p className="text-sm text-muted-foreground">
          Try adjusting the search or filters, or add a new student.
        </p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((student) => (
        <li key={student.id}>
          <button
            type="button"
            onClick={() => navigate(`/students/${student.id}`)}
            className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <StudentAvatar
              name={student.name}
              photoUrl={photoDisplayUrl("students", student.id, student.photoUrl)}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-foreground">{student.name}</span>
                <StudentStatusBadge status={student.status} />
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {student.admissionNumber}
                {student.class ? ` · Class ${student.class.name}-${student.section?.name}` : ""}
              </span>
              {student.primaryGuardian && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
                  Guardian: {student.primaryGuardian.name}
                </span>
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function StudentsTableSkeleton() {
  return (
    <div className="hidden rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:block">
      <div className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StudentsCardsSkeleton() {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}