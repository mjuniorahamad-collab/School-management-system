import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MEMBERSHIP_STATUS_OPTIONS } from "@/types/users"
import type { RoleListResult } from "@/types/users"

interface UsersToolbarProps {
  search: string
  status: string
  roleId: string
  roles: RoleListResult | undefined
  canCreate: boolean
  onSearchChange: (value: string) => void
  onStatusChange: (value: string) => void
  onRoleChange: (value: string) => void
  onCreateClick: () => void
}

export function UsersToolbar({
  search,
  status,
  roleId,
  roles,
  canCreate,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onCreateClick,
}: UsersToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name or email…"
            aria-label="Search users"
            className="pl-9"
          />
        </div>
        {canCreate && (
          <Button onClick={onCreateClick} className="shrink-0">
            <Plus className="size-4" aria-hidden="true" />
            Add User
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={status || "all"} onValueChange={(v) => onStatusChange(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by membership status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {MEMBERSHIP_STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleId || "all"} onValueChange={(v) => onRoleChange(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[160px]" aria-label="Filter by role">
            <SelectValue placeholder="All roles" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles?.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}