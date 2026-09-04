import { ChevronRight, Edit } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { Skeleton } from "@/components/ui/skeleton"
import { StaffStatusBadge } from "@/components/staff/StaffStatusBadge"
import type { StaffListItem } from "@/types/staff"
import { formatFullDate } from "@/lib/format"

interface StaffViewProps {
  items: StaffListItem[]
  isPending: boolean
  isError: boolean
  canEdit: boolean
  onRetry: () => void
  onEdit: (staff: StaffListItem) => void
}

export function StaffTable({ items, isPending, isError, canEdit, onRetry, onEdit }: StaffViewProps) {
  const navigate = useNavigate()
  if (isPending) return <StaffSkeleton table />
  if (isError) return <ErrorSkeleton text="Could not load staff members." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">Staff Member</th>
              <th scope="col" className="px-4 py-3 font-medium">Department</th>
              <th scope="col" className="px-4 py-3 font-medium">Designation</th>
              <th scope="col" className="px-4 py-3 font-medium">Phone</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Joined</th>
              <th scope="col" className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((staff) => (
              <tr
                key={staff.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => navigate(`/staff/${staff.id}`)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{staff.name}</p>
                  <p className="text-xs text-muted-foreground">{staff.employeeId}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {staff.department}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {staff.designation}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {staff.phone || "—"}
                </td>
                <td className="px-4 py-3">
                  <StaffStatusBadge status={staff.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE"} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {formatFullDate(staff.joiningDate)}
                </td>
                <td className="px-4 py-3 text-right">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onEdit(staff) }}
                      className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      aria-label={`Edit ${staff.name}`}
                    >
                      <Edit className="size-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function StaffCards({ items, isPending, isError, canEdit, onRetry, onEdit }: StaffViewProps) {
  const navigate = useNavigate()
  if (isPending) return <StaffSkeleton table={false} />
  if (isError) return <ErrorSkeleton text="Could not load staff members." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((staff) => (
        <li key={staff.id}>
          <div className="flex items-center gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:bg-muted/40">
            <button
              type="button"
              onClick={() => navigate(`/staff/${staff.id}`)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate text-sm font-medium text-foreground">
                {staff.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {staff.employeeId} · {staff.department}
              </span>
            </button>
            <StaffStatusBadge status={staff.status as "ACTIVE" | "INACTIVE" | "ON_LEAVE"} />
            {canEdit && (
              <button
                type="button"
                onClick={() => onEdit(staff)}
                className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                aria-label={`Edit ${staff.name}`}
              >
                <Edit className="size-4" aria-hidden="true" />
              </button>
            )}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-foreground">No staff members found</p>
      <p className="text-sm text-muted-foreground">Try adjusting the search, or add a new staff member.</p>
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

function StaffSkeleton({ table }: { table: boolean }) {
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
