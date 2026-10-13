import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"
import { assignCompetitionRanks } from "../src/modules/results/ranking.js"
import type { RankableResult } from "../src/modules/results/ranking.js"
import { bulkUpdateResultRanks } from "../src/modules/results/result-bulk-writes.js"
import { createRng } from "./helpers/seeded-random.js"

// Independent calculation-verification suite for competition ranking and the
// batched rank writer. Complements results.unit.test.ts with tie/skip cases,
// the 1e-9 float tolerance, and the DB-free SQL shape of the bulk writer.

function rankMap(rows: readonly RankableResult[]): Map<string, number | null> {
  return new Map(assignCompetitionRanks(rows).map((row) => [row.id, row.rank]))
}

describe("assignCompetitionRanks (calculation)", () => {
  it("returns an empty list for no results", () => {
    expect(assignCompetitionRanks([])).toEqual([])
  })

  it("ranks a single complete result first", () => {
    expect(assignCompetitionRanks([{ id: "x", totalPercentage: 55, isComplete: true }])).toEqual([
      { id: "x", rank: 1 },
    ])
  })

  it("returns a null rank for a single incomplete result", () => {
    expect(assignCompetitionRanks([{ id: "x", totalPercentage: 90, isComplete: false }])).toEqual([
      { id: "x", rank: null },
    ])
  })

  it("ranks distinct percentages 1,2,3", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 90, isComplete: true },
      { id: "b", totalPercentage: 80, isComplete: true },
      { id: "c", totalPercentage: 70, isComplete: true },
    ])
    expect([ranks.get("a"), ranks.get("b"), ranks.get("c")]).toEqual([1, 2, 3])
  })

  it("shares a rank on a tie and skips the tied count (1,1,3)", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 90, isComplete: true },
      { id: "b", totalPercentage: 90, isComplete: true },
      { id: "c", totalPercentage: 80, isComplete: true },
    ])
    expect([ranks.get("a"), ranks.get("b"), ranks.get("c")]).toEqual([1, 1, 3])
  })

  it("skips a triple tie to the next position (1,1,1,4)", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 90, isComplete: true },
      { id: "b", totalPercentage: 90, isComplete: true },
      { id: "c", totalPercentage: 90, isComplete: true },
      { id: "d", totalPercentage: 80, isComplete: true },
    ])
    expect([ranks.get("a"), ranks.get("b"), ranks.get("c"), ranks.get("d")]).toEqual([1, 1, 1, 4])
  })

  it("handles two tie groups (1,1,3,3,5)", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 88.5, isComplete: true },
      { id: "b", totalPercentage: 88.5, isComplete: true },
      { id: "c", totalPercentage: 75, isComplete: true },
      { id: "d", totalPercentage: 75, isComplete: true },
      { id: "e", totalPercentage: 60, isComplete: true },
    ])
    expect([ranks.get("a"), ranks.get("b"), ranks.get("c"), ranks.get("d"), ranks.get("e")]).toEqual([
      1, 1, 3, 3, 5,
    ])
  })

  it("excludes a high-scoring incomplete result without shifting other ranks", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 90, isComplete: true },
      { id: "x", totalPercentage: 99, isComplete: false },
      { id: "b", totalPercentage: 80, isComplete: true },
    ])
    expect(ranks.get("x")).toBeNull()
    expect([ranks.get("a"), ranks.get("b")]).toEqual([1, 2])
  })

  it("excludes a null percentage from ranking", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 90, isComplete: true },
      { id: "x", totalPercentage: null, isComplete: true },
    ])
    expect(ranks.get("x")).toBeNull()
    expect(ranks.get("a")).toBe(1)
  })

  it("returns all-null ranks when no result is complete", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 90, isComplete: false },
      { id: "b", totalPercentage: null, isComplete: false },
    ])
    expect(ranks.get("a")).toBeNull()
    expect(ranks.get("b")).toBeNull()
  })

  it("ties percentages within the 1e-9 tolerance", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 88.5, isComplete: true },
      { id: "b", totalPercentage: 88.5000000001, isComplete: true },
    ])
    expect([ranks.get("a"), ranks.get("b")]).toEqual([1, 1])
  })

  it("does not tie percentages separated by more than 1e-9", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 88.5000001, isComplete: true },
      { id: "b", totalPercentage: 88.5, isComplete: true },
    ])
    expect([ranks.get("a"), ranks.get("b")]).toEqual([1, 2])
  })

  it("preserves input order and returns one row per input", () => {
    const input: RankableResult[] = [
      { id: "b", totalPercentage: 80, isComplete: true },
      { id: "a", totalPercentage: 90, isComplete: true },
    ]
    const result = assignCompetitionRanks(input)
    expect(result.map((row) => row.id)).toEqual(["b", "a"])
    expect(result).toHaveLength(input.length)
  })

  it("produces the same rank mapping regardless of input order", () => {
    const input: RankableResult[] = [
      { id: "a", totalPercentage: 88.5, isComplete: true },
      { id: "b", totalPercentage: 88.5, isComplete: true },
      { id: "c", totalPercentage: 75, isComplete: true },
      { id: "d", totalPercentage: 60, isComplete: true },
    ]
    const forward = rankMap(input)
    const backward = rankMap([...input].reverse())
    for (const row of input) {
      expect(backward.get(row.id)).toBe(forward.get(row.id))
    }
  })

  it("ranks zero percentages as valid values", () => {
    const ranks = rankMap([
      { id: "a", totalPercentage: 0, isComplete: true },
      { id: "b", totalPercentage: 0, isComplete: true },
      { id: "c", totalPercentage: 10, isComplete: true },
    ])
    expect([ranks.get("c"), ranks.get("a"), ranks.get("b")]).toEqual([1, 2, 2])
  })
})

describe("bulkUpdateResultRanks (calculation, DB-free SQL shape)", () => {
  function makeTx() {
    const calls: Prisma.Sql[] = []
    const tx = {
      $executeRaw: async (sql: Prisma.Sql): Promise<number> => {
        calls.push(sql)
        return sql.values.length / 3
      },
    }
    return { tx: tx as unknown as Prisma.TransactionClient, calls }
  }

  it("does nothing for an empty row set", async () => {
    const { tx, calls } = makeTx()
    const affected = await bulkUpdateResultRanks(tx, [])
    expect(affected).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("writes all ranks in a single statement with three bindings per row", async () => {
    const { tx, calls } = makeTx()
    await bulkUpdateResultRanks(tx, [
      { id: "r1", rank: 1 },
      { id: "r2", rank: 2 },
      { id: "r3", rank: 3 },
    ])
    expect(calls).toHaveLength(1)
    expect(calls[0].values).toHaveLength(9)
  })

  it("emits the expected UPDATE statement text", async () => {
    const { tx, calls } = makeTx()
    await bulkUpdateResultRanks(tx, [{ id: "r1", rank: 1 }])
    expect(calls[0].text).toContain('UPDATE "ExamResult"')
    expect(calls[0].text).toContain('"rank"')
    expect(calls[0].text).toContain("INTEGER")
  })

  it("binds ids and ranks in row order", async () => {
    const { tx, calls } = makeTx()
    await bulkUpdateResultRanks(tx, [
      { id: "r1", rank: 1 },
      { id: "r2", rank: 4 },
    ])
    const values = calls[0].values
    expect(values[0]).toBe("r1")
    expect(values[1]).toBe(1)
    expect(values[3]).toBe("r2")
    expect(values[4]).toBe(4)
  })

  it("stamps a single uniform updatedAt across every row", async () => {
    const { tx, calls } = makeTx()
    await bulkUpdateResultRanks(tx, [
      { id: "r1", rank: 1 },
      { id: "r2", rank: 2 },
      { id: "r3", rank: 3 },
    ])
    const values = calls[0].values
    expect(values[2]).toBeInstanceOf(Date)
    expect(values[2]).toBe(values[5])
    expect(values[5]).toBe(values[8])
  })
})

describe("competition ranking invariants (property, seeded)", () => {
  const rng = createRng(20260906)

  function referenceRanks(rows: readonly RankableResult[]): Map<string, number> {
    const eligible = rows
      .filter((row) => row.isComplete && row.totalPercentage !== null)
      .map((row) => ({ id: row.id, pct: row.totalPercentage as number }))
      .sort((a, b) => b.pct - a.pct)
    const result = new Map<string, number>()
    let lastPct: number | null = null
    let lastRank = 0
    eligible.forEach((row, index) => {
      const tie = lastPct !== null && Math.abs(row.pct - lastPct) <= 1e-9
      const rank = tie ? lastRank : index + 1
      result.set(row.id, rank)
      lastPct = row.pct
      lastRank = rank
    })
    return result
  }

  it("matches the reference competition ranking for random result sets", () => {
    for (let i = 0; i < 500; i += 1) {
      const count = rng.int(0, 30)
      const rows: RankableResult[] = Array.from({ length: count }, (_, index) => ({
        id: `s${index}`,
        totalPercentage: rng.next() < 0.2 ? null : rng.dec(0, 100, 2),
        isComplete: rng.next() < 0.8,
      }))
      const expected = referenceRanks(rows)
      const actual = rankMap(rows)
      for (const row of rows) {
        expect(actual.get(row.id)).toBe(expected.get(row.id) ?? null)
      }
    }
  })

  it("never ranks an incomplete or ungraded result", () => {
    for (let i = 0; i < 300; i += 1) {
      const count = rng.int(1, 20)
      const rows: RankableResult[] = Array.from({ length: count }, (_, index) => ({
        id: `s${index}`,
        totalPercentage: rng.next() < 0.3 ? null : rng.dec(0, 100, 2),
        isComplete: rng.next() < 0.7,
      }))
      const ranks = rankMap(rows)
      for (const row of rows) {
        if (!row.isComplete || row.totalPercentage === null) {
          expect(ranks.get(row.id)).toBeNull()
        } else {
          expect(ranks.get(row.id)).toBeGreaterThanOrEqual(1)
        }
      }
    }
  })
})
