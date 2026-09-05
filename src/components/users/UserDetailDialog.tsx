import { useAuth } from "@/auth/useAuth"
import { AccountStatusBadge } from "@/components/users/AccountStatusBadge"
import { MembershipStatusBadge } from "@/components/users/MembershipStatusBadge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { useUser } from "@/hooks/useUsers"
import { formatFullDate } from "@/lib/format"
import type { MembershipStatus, UserAccountStatus } from "@/types/users"

interface UserDetailDialogProps {
  userId: string | null
  canEdit: boolean
  canRemove: boolean
  onEditClick: () => void
  onRemoveClick: () => void
  onOpenChange: (open: boolean) => void
}

export function UserDetailDialog({ userId, canEdit, canRemove, onEditClick, onRemoveClick, onOpenChange }: UserDetailDialogProps) {
  const { user: currentUser } = useAuth()
  const { data, isPending, isError, refetch } = useUser(userId)
  const isSelf = Boolean(userId && currentUser?.id === userId)

  return (
    <Dialog open={userId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">User details</DialogTitle>
          <DialogDescription>Membership of this user in the current school.</DialogDescription>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">Could not load the user.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-base font-semibold text-foreground">{data.name}</p>
              <p className="text-sm text-muted-foreground">{data.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <MembershipStatusBadge status={data.membershipStatus as MembershipStatus} />
                <AccountStatusBadge status={data.accountStatus as UserAccountStatus} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Role: <span className="font-medium text-foreground">{data.role.name}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Added: <span className="tabular-nums">{formatFullDate(data.createdAt)}</span>
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Membership is per-school. The global account stays intact even when this user is removed here,
              and an inactive member cannot sign in to this school.
            </p>
          </div>
        )}

        {data && (
          <DialogFooter className="gap-2 sm:gap-0">
            {canEdit && (
              <Button type="button" variant="outline" onClick={onEditClick}>
                Edit
              </Button>
            )}
            {canRemove && !isSelf && (
              <Button type="button" variant="destructive" onClick={onRemoveClick}>
                Remove
              </Button>
            )}
            <Button type="button" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}