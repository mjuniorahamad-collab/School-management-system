import { describe, it } from "vitest"

/**
 * QUARANTINED — DO NOT RUN, DO NOT MAKE RUNNABLE.
 *
 * This DB-backed suite was disabled because it was unsafe:
 *
 *   1. It resolved its connection string from `TEST_DATABASE_URL` with a
 *      `DATABASE_URL` fallback, so it could silently target a development
 *      database.
 *   2. Its `beforeAll` ran destructive `deleteMany()` calls across
 *      TenantMembershipPermission, TenantMembership, User, RolePermission,
 *      Permission, Role and School, bypassing the shared test-database guards.
 *   3. It created and mutated rows (School, Role, Permission, User,
 *      TenantMembership, TenantMembershipPermission).
 *
 * The owner has explicitly forbidden deleting or resetting ANY existing data,
 * including test-database data. This suite must therefore not connect to any
 * database at all (not even TEST_DATABASE_URL) until a non-destructive
 * strategy exists, such as a per-run isolated schema/database or
 * transaction-scoped fixtures.
 *
 * TODO: restore coverage — with a safe harness — for these original behaviors:
 *   1. changing the last qualifying SCHOOL_ADMIN's role is rejected
 *   2. deactivating the last qualifying SCHOOL_ADMIN is rejected
 *   3. removing the last qualifying SCHOOL_ADMIN is rejected
 *   4. with two qualifying School Admins, removing one succeeds
 *
 * The original assertions were REMOVED, not ported. This file provides NO
 * coverage until it is rewritten against a non-destructive test strategy.
 *
 * `describe.skip` is unconditional on purpose: no environment variable can
 * enable this suite.
 */
describe.skip("last-admin protection (integration) — QUARANTINED", () => {
  it.skip("all last-admin assertions are disabled until a non-destructive harness exists")
})
