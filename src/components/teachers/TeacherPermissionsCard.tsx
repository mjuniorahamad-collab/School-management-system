import { KeyRound } from "lucide-react"
import { useAuth } from "@/auth/useAuth"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useGrantMembershipPermission,
  useMembershipPermissions,
  useTeacherMembership,
} from "@/hooks/useMembershipPermissions"
import type {
  MembershipPermissionOverride,
  MembershipPermissionsView,
} from "@/types/membershipPermissions"

interface PermissionBadgesProps {
  codes: string[]
  empty: string
  variant?: "outline" | "secondary"
}

function PermissionBadges({ codes, empty, variant = "outline" }: PermissionBadgesProps) {
  if (codes.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {codes.map((code) => (
        <li key={code}>
          <Badge variant={variant}>
            <code>{code}</code>
          </Badge>
        </li>
      ))}
    </ul>
  )
}

function PermissionSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-44" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function denyOverrides(overrides: MembershipPermissionOverride[]): MembershipPermissionOverride[] {
  return overrides.filter((override) => override.effect === "DENY")
}

function allowOverrides(overrides: MembershipPermissionOverride[]): MembershipPermissionOverride[] {
  return overrides.filter((override) => override.effect === "ALLOW")
}

function PermissionsBody({
  data,
  teacherId,
}: {
  data: MembershipPermissionsView
  teacherId: string
}) {
  const { can } = useAuth()
  const canGrant = can("membership-permissions:grant")
  const grant = useGrantMembershipPermission(teacherId)

  const inherited = new Set(data.roleDefaultPermissions)
  const extraGrants = allowOverrides(data.overrides)
  const granted = new Set(extraGrants.map((override) => override.permissionCode))
  const denied = new Set(
    denyOverrides(data.overrides).map((override) => override.permissionCode),
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Role</span>
        <Badge variant="secondary">{data.role}</Badge>
        <span className="text-muted-foreground">·</span>
        <span>{data.effectivePermissions.length} effective permissions</span>
      </div>

      {denied.size > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <p className="font-medium text-destructive">Existing deny overrides</p>
          <p className="mt-1 text-muted-foreground">
            Additive grants will not change these records:{" "}
            {Array.from(denied).join(", ")}.
          </p>
        </div>
      )}

      <section>
        <h3 className="text-sm font-medium text-foreground">Inherited role permissions</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These permissions come from the {data.role} role.
        </p>
        <PermissionBadges
          codes={data.roleDefaultPermissions}
          empty="This role has no default permissions."
        />
      </section>

      <section>
        <h3 className="text-sm font-medium text-foreground">Extra permissions</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Membership-specific ALLOW grants layered on this role.
        </p>
        <PermissionBadges
          codes={extraGrants.map((override) => override.permissionCode)}
          empty="No extra permissions have been granted."
          variant="secondary"
        />
      </section>

      <details>
        <summary className="cursor-pointer text-sm font-medium text-foreground">
          Effective access ({data.effectivePermissions.length})
        </summary>
        <p className="mt-1 text-sm text-muted-foreground">
          Includes role defaults and active extra grants.
        </p>
        <PermissionBadges
          codes={data.effectivePermissions}
          empty="No effective permissions."
        />
      </details>

      {canGrant && (
        <section className="border-t pt-4">
          <h3 className="text-sm font-medium text-foreground">Grant an extra permission</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Only permissions you hold and that are allowed for this role are shown.
          </p>

          {data.grantablePermissions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No additional permissions are available to grant.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {data.grantablePermissions.map((code) => {
                const isInherited = inherited.has(code)
                const isGranted = granted.has(code)
                const isDenied = denied.has(code)

                return (
                  <li
                    key={code}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <code className="text-sm">{code}</code>
                    {isGranted ? (
                      <Badge variant="secondary">Granted</Badge>
                    ) : isInherited ? (
                      <Badge variant="outline">Inherited</Badge>
                    ) : isDenied ? (
                      <Badge variant="destructive">Blocked</Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={grant.isPending}
                        aria-label={`Grant ${code}`}
                        onClick={() =>
                          grant.mutate({
                            membershipId: data.membershipId,
                            permissionCode: code,
                          })
                        }
                      >
                        Grant
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

export function TeacherPermissionsCard({ teacherId }: { teacherId: string }) {
  const { can } = useAuth()
  const canView = can("membership-permissions:view")
  const membershipQuery = useTeacherMembership(teacherId, canView)
  const membershipId = membershipQuery.data?.membershipId ?? null
  const permissionsQuery = useMembershipPermissions(membershipId, canView)

  if (!canView) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden="true" />
          Extra permissions
        </CardTitle>
        <CardDescription>
          Manage permissions layered on this teacher's role for their login membership.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {membershipQuery.isPending && <PermissionSkeleton />}

        {membershipQuery.isError && (
          <QueryError
            message="Could not load this teacher's membership."
            onRetry={() => void membershipQuery.refetch()}
          />
        )}

        {membershipQuery.data && !membershipId && (
          <p className="text-sm text-muted-foreground">
            This teacher is not linked to an active login account in this school. Extra
            permissions can only be managed for linked teacher memberships.
          </p>
        )}

        {membershipId && permissionsQuery.isPending && <PermissionSkeleton />}

        {membershipId && permissionsQuery.isError && (
          <QueryError
            message="Could not load permissions for this teacher's membership."
            onRetry={() => void permissionsQuery.refetch()}
          />
        )}

        {membershipId && permissionsQuery.data && (
          <PermissionsBody data={permissionsQuery.data} teacherId={teacherId} />
        )}
      </CardContent>
    </Card>
  )
}
