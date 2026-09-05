import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from "@/auth/useAuth"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { UserDetailDialog } from "@/components/users/UserDetailDialog"
import { UserFormDialog } from "@/components/users/UserFormDialog"
import { UsersCards, UsersTable } from "@/components/users/UsersList"
import { UsersToolbar } from "@/components/users/UsersToolbar"
import { useRemoveUser, useUsers } from "@/hooks/useUsers"
import { useRoles } from "@/hooks/useRoles"
import type { MembershipStatus, UserMembershipListItem } from "@/types/users"

const SEARCH_DEBOUNCE_MS = 350

function readParam(searchParams: URLSearchParams, key: string): string {
  return searchParams.get(key) ?? ""
}

export function UsersTab() {
  const { can } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParamsRef = useRef(searchParams)
  useEffect(() => {
    searchParamsRef.current = searchParams
  }, [searchParams])

  const [searchDraft, setSearchDraft] = useState(() => readParam(searchParams, "search"))
  const [statusDraft, setStatusDraft] = useState(() => readParam(searchParams, "status"))
  const [roleIdDraft, setRoleIdDraft] = useState(() => readParam(searchParams, "roleId"))

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<UserMembershipListItem | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<UserMembershipListItem | null>(null)

  const search = readParam(searchParams, "search")
  const status = readParam(searchParams, "status")
  const roleId = readParam(searchParams, "roleId")
  const page = Math.max(1, Number(readParam(searchParams, "page")) || 1)
  const pageSize = Math.max(1, Number(readParam(searchParams, "pageSize")) || 25)

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParamsRef.current)
      if (searchDraft) next.set("search", searchDraft)
      else next.delete("search")
      if (statusDraft) next.set("status", statusDraft)
      else next.delete("status")
      if (roleIdDraft) next.set("roleId", roleIdDraft)
      else next.delete("roleId")
      next.delete("page")
      setSearchParams(next, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchDraft, statusDraft, roleIdDraft, setSearchParams])

  const query = {
    search: search || undefined,
    status: (status || undefined) as MembershipStatus | undefined,
    roleId: roleId || undefined,
    page,
    pageSize,
  }
  const { data, isPending, isError, refetch } = useUsers(query)
  const { data: roles } = useRoles()
  const removeUser = useRemoveUser()

  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(searchParams)
    next.set("page", String(nextPage))
    setSearchParams(next, { replace: true })
  }

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(user: UserMembershipListItem) {
    setDetailId(null)
    setEditing(user)
    setFormOpen(true)
  }

  function openRemove(user: UserMembershipListItem) {
    setDetailId(null)
    setRemoveTarget(user)
  }

  return (
    <div className="flex flex-col gap-4">
      <UsersToolbar
        search={searchDraft}
        status={statusDraft}
        roleId={roleIdDraft}
        roles={roles}
        canCreate={can("users:create")}
        onSearchChange={setSearchDraft}
        onStatusChange={setStatusDraft}
        onRoleChange={setRoleIdDraft}
        onCreateClick={openCreate}
      />

      <UsersTable
        items={items}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        onSelect={(user) => setDetailId(user.id)}
      />
      <UsersCards
        items={items}
        isPending={isPending}
        isError={isError}
        onRetry={() => void refetch()}
        onSelect={(user) => setDetailId(user.id)}
      />

      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages} · {total} user{total !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
            >
              ← Prev
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              onClick={() => goToPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded px-2 py-1 font-medium hover:bg-muted disabled:opacity-40 disabled:pointer-events-none"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      <UserFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        user={editing}
      />
      <UserDetailDialog
        userId={detailId}
        canEdit={can("users:update")}
        canRemove={can("users:delete")}
        onEditClick={() => {
          const user = items.find((item) => item.id === detailId)
          if (user) openEdit(user)
        }}
        onRemoveClick={() => {
          const user = items.find((item) => item.id === detailId)
          if (user) openRemove(user)
        }}
        onOpenChange={(open) => {
          if (!open) setDetailId(null)
        }}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null)
        }}
        title="Remove user from school?"
        description={
          removeTarget
            ? `${removeTarget.name} will no longer be able to sign in to this school. Their global account and data are not deleted.`
            : ""
        }
        confirmLabel="Remove"
        isPending={removeUser.isPending}
        onConfirm={() => {
          if (removeTarget) removeUser.mutate(removeTarget.id, { onSuccess: () => setRemoveTarget(null) })
        }}
      />
    </div>
  )
}