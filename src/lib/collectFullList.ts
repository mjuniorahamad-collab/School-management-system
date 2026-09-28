/**
 * Collecting a complete, filtered list from a paginated endpoint for printing.
 *
 * Print artifacts are the one place where a partial dataset is worse than none: a
 * circulation register missing 200 loans, or a passenger list that silently stops
 * at row 100, reads as complete and is not. This module is the guard for that.
 *
 * It is deliberately a pure function with no React and no service imports, so the
 * completeness rules can be unit-tested directly.
 */

export interface PagedResult<T> {
  items: T[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

/** A collection that cannot be trusted enough to print. */
export class FullListError extends Error {
  readonly reason: "over-limit" | "inconsistent" | "fetch-failed"

  constructor(message: string, reason: "over-limit" | "inconsistent" | "fetch-failed") {
    super(message)
    this.name = "FullListError"
    this.reason = reason
  }
}

export interface CollectFullListOptions<T> {
  /**
   * Fetches one page. Called with page 1 first, then the remaining pages. The
   * fetcher owns the page size (callers should use the API maximum).
   */
  fetchPage: (page: number) => Promise<PagedResult<T>>
  /** Hard ceiling on printed rows. */
  maxRows: number
}

export interface CollectedList<T> {
  rows: T[]
  total: number
}

/**
 * Reads the whole filtered dataset, page by page, and refuses to return anything
 * it cannot prove is complete.
 *
 * The rules, in order:
 *  1. Page 1 establishes `total`. If it exceeds `maxRows`, stop immediately —
 *     no further requests are made, because the answer is already known.
 *  2. Otherwise fetch the remaining pages concurrently (at most `maxRows /
 *     pageSize` requests in total).
 *  3. Deduplicate by `id`. Overlapping pages would otherwise double-print rows.
 *  4. If the deduplicated count does not equal `total`, the dataset shifted while
 *     it was being read; throw rather than print something misleading.
 */
export async function collectFullList<T extends { id: string }>({
  fetchPage,
  maxRows,
}: CollectFullListOptions<T>): Promise<CollectedList<T>> {
  let first: PagedResult<T>
  try {
    first = await fetchPage(1)
  } catch {
    throw new FullListError("Could not load the full list to print. Please try again.", "fetch-failed")
  }

  const total = first.pagination.total
  const totalPages = first.pagination.totalPages

  if (total > maxRows) {
    throw new FullListError(
      `This list has ${total} records, which is more than the ${maxRows}-record print limit. Narrow the filters and try again.`,
      "over-limit",
    )
  }

  const remainingPages: number[] = []
  for (let page = 2; page <= totalPages; page += 1) remainingPages.push(page)

  let rest: PagedResult<T>[]
  try {
    rest = await Promise.all(remainingPages.map((page) => fetchPage(page)))
  } catch {
    // A partial collection is never printed, so a failure here is fatal by design.
    throw new FullListError("Could not load the full list to print. Please try again.", "fetch-failed")
  }

  const seen = new Set<string>()
  const rows: T[] = []
  for (const result of [first, ...rest]) {
    for (const item of result.items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      rows.push(item)
    }
  }

  if (rows.length !== total) {
    throw new FullListError(
      `The list changed while it was being collected (expected ${total} records, received ${rows.length}). Nothing was printed — please try again.`,
      "inconsistent",
    )
  }

  return { rows, total }
}
