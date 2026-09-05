import { Skeleton } from "@/components/ui/skeleton"
import { formatFullDate } from "@/lib/format"
import { AccountStatusBadge } from "@/components/users/AccountStatusBadge"
import { MembershipStatusBadge } from "@/components/users/MembershipStatusBadge"
import type { MembershipStatus, UserAccountStatus, UserMembershipListItem } from "@/types/users"

interface UsersViewProps {
  items: UserMembershipListItem[]
  isPending: boolean
  isError: boolean
  onRetry: () => void
  onSelect: (user: UserMembershipListItem) => void
}

export function UsersTable({ items, isPending, isError, onRetry, onSelect }: UsersViewProps) {
  if (isPending) return <UsersSkeleton table />
  if (isError) return <ErrorState text="Could not load users." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <div className="hidden overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:block">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">User</th>
              <th scope="col" className="px-4 py-3 font-medium">Role</th>
              <th scope="col" className="px-4 py-3 font-medium">Membership</th>
              <th scope="col" className="px-4 py-3 font-medium">Account</th>
              <th scope="col" className="px-4 py-3 font-medium">Added</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((user) => (
              <tr
                key={user.id}
                className="cursor-pointer transition-colors hover:bg-muted/40"
                onClick={() => onSelect(user)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className="text-muted-foreground">{user.role.name}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <MembershipStatusBadge status={user.membershipStatus as MembershipStatus} />
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <AccountStatusBadge status={user.accountStatus as UserAccountStatus} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground tabular-nums">
                  {formatFullDate(user.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function UsersCards({ items, isPending, isError, onRetry, onSelect }: UsersViewProps) {
  if (isPending) return <UsersSkeleton table={false} />
  if (isError) return <ErrorState text="Could not load users." onRetry={onRetry} />
  if (items.length === 0) return <EmptyState />

  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {items.map((user) => (
        <li key={user.id}>
          <button
            type="button"
            onClick={() => onSelect(user)}
            className="flex w-full items-center gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {user.email} · {user.role.name}
              </span>
            </span>
            <MembershipStatusBadge status={user.membershipStatus as MembershipStatus} />
            <AccountStatusBadge status={user.accountStatus as UserAccountStatus} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed py-16 text-center">
      <p className="text-sm font-medium text-foreground">No users found</p>
      <p className="text-sm text-muted-foreground">Try adjusting the search, or add a user to this school.</p>
    </div>
  )
}

function ErrorState({ text, onRetry }: { text: string; onRetry: () => void }) {
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

function UsersSkeleton({ table }: { table: boolean }) {
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