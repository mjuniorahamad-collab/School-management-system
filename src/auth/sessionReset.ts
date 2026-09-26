import type { QueryClient } from "@tanstack/react-query"
import { clearActiveSchoolId } from "@/auth/activeSchool"
import { ME_QUERY_KEY } from "@/auth/context"

// Auth-namespaced query keys survive a tenant switch or a forced sign-out so
// identity can be reloaded; everything else is tenant scoped and must go.
export function isAuthQueryKey(key: readonly unknown[]): boolean {
  return key[0] === "auth"
}

/**
 * Puts the client into a deterministic signed-out state. Used both for an
 * explicit logout and for a forced sign-out (a 401 whose refresh token the
 * server also rejected, broadcast by `onSignedOut`).
 *
 * Order matters: the active school is dropped first so no later request can be
 * tagged with a revoked tenant, then every tenant-scoped query is removed, then
 * the auth query is pinned to `{ user: null }`.
 *
 * The ME query is deliberately never removed. Removing a query that still has
 * an observer destroys it and silently cancels its in-flight fetch, which
 * strands the AuthProvider's observer in `isLoading: true` forever (the observer
 * only re-resolves its Query instance on the next render, and a removed query
 * never dispatches an update to trigger one). Writing `{ user: null }` into the
 * live query instead ends loading immediately and gives the same result the ME
 * query function would produce on its own for a 401.
 *
 * Safe to call repeatedly: concurrent 401s can each trigger a sign-out event,
 * and every call converges on the same state.
 */
export function resetSessionState(queryClient: QueryClient): void {
  clearActiveSchoolId()
  queryClient.removeQueries({ predicate: (query) => !isAuthQueryKey(query.queryKey) })
  queryClient.setQueryData(ME_QUERY_KEY, { user: null })
}
