import { SUPER_ADMIN_ROLE } from "../permissions/permissions.js"

/**
 * Authorizes a subject against a set of required permission codes.
 *
 * - The SUPER_ADMIN role bypasses the permission check entirely (role-based,
 *   never email-based).
 * - `required` uses ANY semantics: the subject is authorized if they hold at
 *   least one of the given codes. Pass a single code for a plain guard.
 *
 * Pure function, unit-testable without a database.
 */
export function hasPermission(
  roles: readonly string[],
  permissions: ReadonlySet<string>,
  required: readonly string[],
): boolean {
  if (required.length === 0) return true
  if (roles.includes(SUPER_ADMIN_ROLE)) return true
  return required.some((code) => permissions.has(code))
}