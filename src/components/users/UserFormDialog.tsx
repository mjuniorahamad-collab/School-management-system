import { useState } from "react"
import { useAuth } from "@/auth/useAuth"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useCreateUser, useUpdateUser } from "@/hooks/useUsers"
import { useRoles } from "@/hooks/useRoles"
import { validateUserForm, userFormToCreatePayload, type UserFormValue } from "@/lib/userFormRules"
import type { MembershipStatus, UserMembershipListItem } from "@/types/users"

interface UserFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user?: UserMembershipListItem | null
}

const EMPTY: UserFormValue = { name: "", email: "", password: "", roleId: "", status: "ACTIVE" }

function toFormValue(user?: UserMembershipListItem | null): UserFormValue {
  if (!user) return EMPTY
  return {
    name: user.name,
    email: user.email,
    password: "",
    roleId: user.role.id,
    status: user.membershipStatus as MembershipStatus,
  }
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
  const editMode = Boolean(user)
  const formKey = user?.id ?? "new"
  const { user: currentUser } = useAuth()
  const isSelf = editMode && currentUser?.id === user?.id

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editMode ? "Edit User" : "Add User"}</DialogTitle>
        </DialogHeader>
        <UserFormInner
          key={formKey}
          initialValue={toFormValue(user)}
          editMode={editMode}
          user={user}
          isSelf={Boolean(isSelf)}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}

function UserFormInner({
  initialValue,
  editMode,
  user,
  isSelf,
  onOpenChange,
}: {
  initialValue: UserFormValue
  editMode: boolean
  user?: UserMembershipListItem | null
  isSelf: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [value, setValue] = useState<UserFormValue>(initialValue)
  const [errors, setErrors] = useState<{ field: keyof UserFormValue; message: string }[]>([])
  const createUser = useCreateUser()
  const updateUser = useUpdateUser(user?.id ?? "")
  const { data: roles } = useRoles()

  const fieldError = (field: keyof UserFormValue) => {
    const error = errors.find((e) => e.field === field)
    return error ? (
      <p className="mt-1 text-xs text-destructive">{error.message}</p>
    ) : null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const formErrors = validateUserForm(value, { requirePassword: !editMode })
    if (formErrors.length > 0) {
      setErrors(formErrors)
      return
    }
    setErrors([])
    if (editMode && user) {
      await updateUser.mutateAsync(
        { roleId: value.roleId, status: value.status },
        { onSuccess: () => onOpenChange(false) },
      )
    } else {
      await createUser.mutateAsync(userFormToCreatePayload(value), { onSuccess: () => onOpenChange(false) })
    }
  }

  const isSaving = createUser.isPending || updateUser.isPending

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {editMode && user ? (
        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <p className="font-medium text-foreground">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Sign-in identity is global. Use this screen to change this user's role or membership status here.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input value={value.name} onChange={(e) => setValue({ ...value, name: e.target.value })} />
            {fieldError("name")}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input type="email" value={value.email} onChange={(e) => setValue({ ...value, email: e.target.value })} />
            {fieldError("email")}
            <p className="text-xs text-muted-foreground">
              If an account with this email already exists, they will be added to this school instead of creating a duplicate.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">
              Initial password <span className="text-destructive">*</span>
            </Label>
            <Input
              type="password"
              autoComplete="new-password"
              value={value.password}
              onChange={(e) => setValue({ ...value, password: e.target.value })}
            />
            {fieldError("password")}
            <p className="text-xs text-muted-foreground">
              Hidden from the app after sign-up. Existing accounts keep their current password.
            </p>
          </div>
        </>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Role <span className="text-destructive">*</span>
        </Label>
        <Select value={value.roleId} onValueChange={(v) => setValue({ ...value, roleId: v })}>
          <SelectTrigger aria-label="Select role">
            <SelectValue placeholder="Select a role…" />
          </SelectTrigger>
          <SelectContent>
            {roles?.map((role) => (
              <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldError("roleId")}
      </div>

      {editMode && (
        <div className="flex items-center justify-between rounded-lg ring-1 ring-foreground/10 p-3">
          <div>
            <p className="text-sm font-medium text-foreground">Active membership</p>
            <p className="text-xs text-muted-foreground">
              {isSelf
                ? "You cannot deactivate your own membership."
                : "Inactive members can no longer sign in to this school."}
            </p>
          </div>
          <Switch
            checked={value.status === "ACTIVE"}
            onCheckedChange={(checked) => setValue({ ...value, status: checked ? "ACTIVE" : "INACTIVE" })}
            aria-label="Membership status"
            disabled={isSelf}
          />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : editMode ? "Update" : "Create"}
        </Button>
      </DialogFooter>
    </form>
  )
}