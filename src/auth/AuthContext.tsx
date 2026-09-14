import { useCallback, useEffect, useMemo } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiClientError, onSignedOut } from "@/lib/apiClient"
import { canUser } from "@/auth/can"
import { AuthContext, ME_QUERY_KEY } from "@/auth/context"
import type { AuthContextValue } from "@/auth/context"
import type { LoginInput } from "@/auth/types"
import { fetchMe, login as loginRequest, logout as logoutRequest } from "@/services/authService"

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // When a request fails a 401 and the refresh token is also rejected, the
  // session is over. Clear the cached identity so ProtectedRoute redirects.
  useEffect(
    () =>
      onSignedOut(() => {
        queryClient.setQueryData(ME_QUERY_KEY, { user: null })
      }),
    [queryClient],
  )

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

  const can = useCallback((permission: string) => canUser(user, permission), [user])

  const signIn = useCallback(
    async (input: LoginInput) => {
      const { user: signedInUser } = await loginRequest(input)
      queryClient.setQueryData(ME_QUERY_KEY, { user: signedInUser })
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
    queryClient.setQueryData(ME_QUERY_KEY, { user: null })
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: meQuery.isLoading,
      isError: meQuery.isError,
      refetch: () => void meQuery.refetch(),
      can,
      signIn,
      signOut,
    }),
    [user, meQuery, can, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}