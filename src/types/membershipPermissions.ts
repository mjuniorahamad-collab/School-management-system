// Frontend contract for membership-scoped permission overrides. Mirrors the
// backend service response (server/src/modules/membership-permissions).

export type MembershipPermissionEffect = "ALLOW" | "DENY"

export type MembershipPermissionGrantOutcome =
  | "GRANTED"
  | "ALREADY_INHERITED"
  | "ALREADY_GRANTED"

export interface MembershipPermissionOverride {
  permissionCode: string
  effect: MembershipPermissionEffect
}

export interface MembershipPermissionsView {
  membershipId: string
  schoolId: string
  role: string
  roleDefaultPermissions: string[]
  effectivePermissions: string[]
  grantablePermissions: string[]
  overrides: MembershipPermissionOverride[]
}

export interface GrantMembershipPermissionResult extends MembershipPermissionsView {
  outcome: MembershipPermissionGrantOutcome
}
