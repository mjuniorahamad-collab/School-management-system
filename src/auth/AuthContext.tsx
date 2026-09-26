import { useCallback, useEffect, useMemo } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiClientError, onSignedOut } from "@/lib/apiClient"
import { canUser } from "@/auth/can"
import { AuthContext, ME_QUERY_KEY } from "@/auth/context"
import type { AuthContextValue } from "@/auth/context"
import type { LoginInput } from "@/auth/types"
import { getActiveSchoolId, setActiveSchoolId } from "@/auth/activeSchool"
import { isAuthQueryKey, resetSessionState } from "@/auth/sessionReset"
import { fetchMe, login as loginRequest, logout as logoutRequest } from "@/services/authService"

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // When a request fails a 401 and the refresh token is also rejected, the
  // session is over. Drop the active school plus every cached tenant payload
  // so the next sign-in can never observe a previous tenant's data, and settle
  // the auth query on `{ user: null }` so loading always terminates.
  useEffect(() => onSignedOut(() => resetSessionState(queryClient)), [queryClient])

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => {
      try {
        const { user } = await fetchMe()
        return { user }
      } catch (error) {
        // 401/403 simply mean "not signed in"; any other failure is a real error.
        if (error instanceof ApiClientError && (error.status === 401 || error.status === 403)) {
          return { user: null }
        }
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const user = meQuery.data?.user ?? null

  // Reconcile the persisted selection with the server-resolved tenant. On a
  // first login (or when the stored school was revoked) the server picked the
  // default; adopt it so the header matches reality on every later request.
  useEffect(() => {
    if (!user) return
    const stored = getActiveSchoolId()
    const storedIsValid = stored !== null && user.memberships.some((m) => m.id === stored)
    if (!storedIsValid) setActiveSchoolId(user.school.id)
  }, [user])

  const can = useCallback((permission: string) => canUser(user, permission), [user])

  // `signIn` sets the header via the module-level active school *before* the
  // request, so login itself lands on the last-used tenant.
  const signIn = useCallback(
    async (input: LoginInput) => {
      const { user: signedInUser } = await loginRequest(input)
      queryClient.setQueryData(ME_QUERY_KEY, { user: signedInUser })
      setActiveSchoolId(signedInUser.school.id)
      return signedInUser
    },
    [queryClient],
  )

  const signOut = useCallback(async () => {
    try {
      await logoutRequest()
    } catch {
      // Best-effort revocation: local auth state must still clear if offline.
    }
    resetSessionState(queryClient)
  }, [queryClient])

  const switchSchool = useCallback(
    async (schoolId: string) => {
      if (schoolId === getActiveSchoolId()) return
      setActiveSchoolId(schoolId)
      // All non-auth caches are tenant scoped; drop them so the new school can
      // never read the previous one's data. `can()` recomputes because /auth/me
      // returns the new school's role and permissions.
      queryClient.removeQueries({ predicate: (query) => !isAuthQueryKey(query.queryKey) })
      await meQuery.refetch()
    },
    [queryClient, meQuery],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      isError: meQuery.isError,
      refetch: () => void meQuery.refetch(),
      can,
      signIn,
      signOut,
      memberships: user?.memberships ?? [],
      activeSchoolId: getActiveSchoolId(),
      switchSchool,
    }),
    [user, meQuery, can, signIn, signOut, switchSchool],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}