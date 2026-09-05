export interface RankableResult {
  id: string
  totalPercentage: number | null
  isComplete: boolean
}

export interface RankedResult {
  id: string
  rank: number | null
}

/**
 * Assigns competition ("1224") ranks within a single ExamResult list.
 *
 * Rules:
 *   - Only results with a complete marks set are ranked. Incomplete/absent
 *     students are excluded (new policy: absent never counts as zero).
 *   - Students with equal total percentages share the same rank; the next
 *     rank skips the tied count (1, 2, 2, 4).
 *   - Ranks are recomputed at finalize and stored on the row; this function is
 *     pure so it can be unit-tested without a database.
 */
export function assignCompetitionRanks(rows: readonly RankableResult[]): RankedResult[] {
  const eligible = rows
    .filter((row) => row.isComplete && row.totalPercentage !== null)
    .map((row) => ({ id: row.id, pct: row.totalPercentage as number }))
    .sort((a, b) => b.pct - a.pct)

  const rankById = new Map<string, number>()
  let lastPct: number | null = null
  let lastRank = 0

  eligible.forEach((row, index) => {
    const isTie = lastPct !== null && Math.abs(row.pct - lastPct) <= 1e-9
    const rank = isTie ? lastRank : index + 1
    rankById.set(row.id, rank)
    lastPct = row.pct
    lastRank = rank
  })

  return rows.map((row) => ({ id: row.id, rank: rankById.get(row.id) ?? null }))
}