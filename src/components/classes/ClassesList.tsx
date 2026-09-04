import { Pencil } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import type { ClassListItem } from "@/types/classes"

interface ClassesViewProps {
  items: ClassListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  onRetry: () => void
  onEdit: (cls: ClassListItem) => void
}

export function ClassesTable({ items, isPending, isError, canEdit, onRetry, onEdit }: ClassesViewProps) {
  if (isPending) return <ClassesSkeleton table />
  if (isError) return <ErrorSkeleton text="Could not load classes." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Class</th>
              <th scope="col" className="px-4 py-3 font-medium">Sections</th>
              <th scope="col" className="px-4 py-3 font-medium">Students</th>
              <th scope="col" className="px-4 py-3 font-medium">Order</th>
              {canEdit && <th scope="col" className="w-10 px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((cls) => (
              <tr key={cls.id} className="transition-colors hover:bg-muted/40">
                <td className="px-4 py-3 font-medium text-foreground">Class {cls.name}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {cls.sectionCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {cls.studentCount}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {cls.sortOrder}
                </td>
                {canEdit && (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit(cls)}
                      aria-label={`Edit class ${cls.name}`}
                      className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ClassesCards({ items, isPending, isError, canEdit, onRetry, onEdit }: ClassesViewProps) {
  if (isPending) return <ClassesSkeleton table={false} />
  if (isError) return <ErrorSkeleton text="Could not load classes." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((cls) => (
        <li key={cls.id}>
          <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                Class {cls.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {cls.sectionCount} sections · {cls.studentCount} students
              </span>
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(cls)}
                aria-label={`Edit class ${cls.name}`}
                className="inline-flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Pencil className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-foreground">No classes found</p>
      <p className="text-sm text-muted-foreground">Try adjusting the search, or create a new class.</p>
    </div>
  )
}

function ErrorSkeleton({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Try again
      </button>
    </div>
  )
}

function ClassesSkeleton({ table }: { table: boolean }) {
  return (
    <div
      className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${table ? "hidden md:block" : "md:hidden"}`}
    >
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
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
