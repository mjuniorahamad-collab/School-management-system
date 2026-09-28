import { describe, expect, it, vi } from "vitest"
import { collectFullList, FullListError, type PagedResult } from "@/lib/collectFullList"

interface Row {
  id: string
  label: string
}

const row = (id: string): Row => ({ id, label: `row ${id}` })

/** Serves `total` rows across pages of `pageSize`, exactly as a paginated API would. */
function pagedApi(total: number, pageSize: number) {
  const all = Array.from({ length: total }, (_, index) => row(String(index + 1)))
  return async (page: number): Promise<PagedResult<Row>> => {
    const start = (page - 1) * pageSize
    return {
      items: all.slice(start, start + pageSize),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    }
  }
}

describe("collectFullList", () => {
  it("returns a single-page list unchanged", async () => {
    const result = await collectFullList({ fetchPage: pagedApi(12, 100), maxRows: 500 })

    expect(result.total).toBe(12)
    expect(result.rows).toHaveLength(12)
  })

  it("concatenates every page in order", async () => {
    const result = await collectFullList({ fetchPage: pagedApi(250, 100), maxRows: 500 })

    expect(result.rows).toHaveLength(250)
    expect(result.rows[0].id).toBe("1")
    expect(result.rows[249].id).toBe("250")
  })

  it("requests page 1 first, then the rest", async () => {
    const fetchPage = vi.fn(pagedApi(250, 100))
    await collectFullList({ fetchPage, maxRows: 500 })

    expect(fetchPage).toHaveBeenCalledTimes(3)
    expect(fetchPage.mock.calls.map(([page]) => page)).toEqual([1, 2, 3])
  })

  it("handles an empty list", async () => {
    const result = await collectFullList({ fetchPage: pagedApi(0, 100), maxRows: 500 })

    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })

  it("refuses a list over the print limit without fetching further pages", async () => {
    // 742 rows: over the 500 ceiling, so page 1 alone settles it.
    const fetchPage = vi.fn(pagedApi(742, 100))

    await expect(collectFullList({ fetchPage, maxRows: 500 })).rejects.toThrow(FullListError)
    expect(fetchPage).toHaveBeenCalledTimes(1)
  })

  it("names the real count in the over-limit message", async () => {
    await expect(
      collectFullList({ fetchPage: pagedApi(742, 100), maxRows: 500 }),
    ).rejects.toThrow(/742 records/)
  })

  it("accepts a list exactly at the limit", async () => {
    const result = await collectFullList({ fetchPage: pagedApi(500, 100), maxRows: 500 })

    expect(result.rows).toHaveLength(500)
  })

  it("deduplicates rows that appear on more than one page", async () => {
    // A row shifting between pages while the list is read is the common cause.
    const total = 3
    const overlapping = async (page: number): Promise<PagedResult<Row>> => {
      if (page === 1) {
        return { items: [row("a"), row("b")], pagination: { page, pageSize: 2, total, totalPages: 2 } }
      }
      return { items: [row("b"), row("c")], pagination: { page, pageSize: 2, total, totalPages: 2 } }
    }

    const result = await collectFullList({ fetchPage: overlapping, maxRows: 500 })

    expect(result.rows.map((item) => item.id)).toEqual(["a", "b", "c"])
  })

  it("refuses to print when the deduplicated count does not match the total", async () => {
    // A row vanished mid-read: 3 reported, 2 collected. Printing 2 rows labelled
    // as a 3-record list would be a false record.
    const short = async (page: number): Promise<PagedResult<Row>> => {
      if (page === 1) {
        return { items: [row("a")], pagination: { page, pageSize: 1, total: 3, totalPages: 3 } }
      }
      return { items: [], pagination: { page, pageSize: 1, total: 3, totalPages: 3 } }
    }

    await expect(collectFullList({ fetchPage: short, maxRows: 500 })).rejects.toThrow(
      /expected 3 records, received 1/,
    )
  })

  it("reports a failed page fetch instead of printing a partial list", async () => {
    const fetchPage = async (page: number): Promise<PagedResult<Row>> => {
      if (page === 1) {
        return { items: [row("a")], pagination: { page, pageSize: 1, total: 2, totalPages: 2 } }
      }
      throw new Error("network down")
    }

    const error = await collectFullList({ fetchPage, maxRows: 500 }).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(FullListError)
    expect((error as FullListError).reason).toBe("fetch-failed")
  })
})
