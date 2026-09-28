import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { collectFullList, FullListError, type PagedResult } from "@/lib/collectFullList"
import { PRINT_MAX_ROWS } from "@/lib/print"

export interface UseFullFilteredListOptions<T> {
  /**
   * Query key identifying the filter set. A `print` segment is appended so these
   * requests never collide with — or satisfy — the on-screen list query.
   */
  queryKey: readonly unknown[]
  /** Fetches one page of the same filtered list the user is looking at. */
  fetchPage: (page: number) => Promise<PagedResult<T>>
}

export interface UseFullFilteredListResult<T> {
  /**
   * Collects the complete filtered dataset. Resolves to the rows, or `null` when
   * the list could not be proven complete — in which case the caller must not
   * print, and the failure has already been reported to the user.
   */
  collect: () => Promise<T[] | null>
  isCollecting: boolean
}

/**
 * Prints a paginated list in full, or not at all.
 *
 * Nothing is fetched until the user asks to print: the on-screen list stays paged
 * exactly as before, and a print click is what triggers the extra page requests.
 * `staleTime: 0` on every page means the print reflects the database at the moment
 * of printing rather than a cached page-1 from minutes ago.
 *
 * `fetchPage` must request the API's maximum page size — the collector bounds the
 * dataset by `total`, and a small page size would only mean more requests.
 */
export function useFullFilteredList<T extends { id: string }>({
  queryKey,
  fetchPage,
}: UseFullFilteredListOptions<T>): UseFullFilteredListResult<T> {
  const queryClient = useQueryClient()
  const [isCollecting, setIsCollecting] = useState(false)

  const collect = async () => {
    setIsCollecting(true)
    try {
      const { rows } = await collectFullList<T>({
        maxRows: PRINT_MAX_ROWS,
        fetchPage: (page) =>
          queryClient.fetchQuery({
            queryKey: [...queryKey, "print", page],
            queryFn: () => fetchPage(page),
            staleTime: 0,
          }),
      })
      return rows
    } catch (error) {
      toast.error(
        error instanceof FullListError ? error.message : "Could not load the full list to print.",
      )
      return null
    } finally {
      setIsCollecting(false)
    }
  }

  return { collect, isCollecting }
}
