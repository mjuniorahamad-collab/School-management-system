import type { PermissionCode } from "../../permissions/permissions.js"

export const MEMBERSHIP_PERMISSION_VIEW = "membership-permissions:view"
export const MEMBERSHIP_PERMISSION_GRANT = "membership-permissions:grant"

/**
 * V1 owner policy: only TEACHER memberships are eligible for extra grants, and
 * only these two codes may be granted. Every other target role/code pair is
 * rejected, even when the actor holds the code.
 */
export const V1_TARGET_ROLE_GRANTS: Readonly<Record<string, readonly PermissionCode[]>> = {
  TEACHER: ["notices:create", "events:create"],
}

export function isV1TargetRole(roleName: string): boolean {
  return Object.prototype.hasOwnProperty.call(V1_TARGET_ROLE_GRANTS, roleName)
}

export function getAllowedTargetGrantCodes(roleName: string): readonly string[] {
  return V1_TARGET_ROLE_GRANTS[roleName] ?? []
}

/**
 * Server-computed grantable codes for a target: the V1 allow-list intersected
 * with the permissions the actor effectively holds. The frontend must consume
 * this list instead of duplicating the policy.
 */
export function computeGrantablePermissionCodes(
  actorPermissions: ReadonlySet<string>,
  targetRoleName: string,
): PermissionCode[] {
  const allowed = V1_TARGET_ROLE_GRANTS[targetRoleName] ?? []
  return allowed.filter((code) => actorPermissions.has(code))
}
