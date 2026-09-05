// Pure, database-free helpers for the Dashboard aggregation service.
// Keeping the calculations here makes the ranking/trend/context logic unit
// testable without a database (see server/tests/dashboard.unit.test.ts).

/** Percent change vs a prior baseline. 0 prior + positive current = 100; else 0. Rounded to 1dp. */
export function trendPercent(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0
  return Math.round(((current - prior) / prior) * 1000) / 10
}

export interface ExamContextRow {
  examTypeId: string
  academicSessionId: string
  sessionStart: Date
  sessionName: string
  startDate: Date
  endDate: Date
}

export interface ExamContext {
  examTypeId: string
  academicSessionId: string
  sessionName: string
  from: Date
  to: Date
}

/**
 * Selects the most defensible exam context for a cross-class ranking.
 *
 * Because `Exam` is class-scoped, classes legitimately have different latest
 * finalized exams. A ranking is only valid inside one comparable context — a
 * set of FINAL exams sharing the same (examTypeId, academicSessionId). This
 * picks the context with the most participating classes, then the most recent
 * session, then a deterministic name tie-break, so the answer is reproducible.
 * Returns null when no context exists or none has at least two classes.
 */
export function selectBestExamContext(rows: ExamContextRow[]): ExamContext | null {
  if (rows.length === 0) return null

  const groups = new Map<string, { rows: ExamContextRow[]; sessionStart: Date; sessionName: string }>()
  for (const row of rows) {
    const key = `${row.examTypeId}::${row.academicSessionId}`
    const existing = groups.get(key)
    if (existing) {
      existing.rows.push(row)
      if (row.sessionStart > existing.sessionStart) existing.sessionStart = row.sessionStart
    } else {
      groups.set(key, {
        rows: [row],
        sessionStart: row.sessionStart,
        sessionName: row.sessionName,
      })
    }
  }

  let best: { key: string; rows: ExamContextRow[]; sessionStart: Date; sessionName: string } | null = null
  for (const [key, group] of groups) {
    if (!best) {
      best = { key, ...group }
      continue
    }
    const betterSize = group.rows.length > best.rows.length
    const sameSizeNewerSession =
      group.rows.length === best.rows.length && group.sessionStart > best.sessionStart
    const sameSizeSameSessionDeterministic =
      group.rows.length === best.rows.length &&
      group.sessionStart.getTime() === best.sessionStart.getTime() &&
      key < best.key
    if (betterSize || sameSizeNewerSession || sameSizeSameSessionDeterministic) {
      best = { key, ...group }
    }
  }

  if (!best || best.rows.length < 2) return null

  let from = best.rows[0].startDate
  let to = best.rows[0].endDate
  for (const row of best.rows) {
    if (row.startDate < from) from = row.startDate
    if (row.endDate > to) to = row.endDate
  }

  return {
    examTypeId: best.rows[0].examTypeId,
    academicSessionId: best.rows[0].academicSessionId,
    sessionName: best.sessionName,
    from,
    to,
  }
}

export interface ClassPerformanceInput {
  className: string
  percentage: number
}

export interface ClassRankingEntry {
  rank: number
  name: string
  performance: number
  students: number
}

/**
 * Aggregates per-student exam percentages into a class ranking: groups by class,
 * averages, orders descending, assigns stable ranks. The caller decides whether
 * the result is large enough to be a meaningful comparison.
 */
export function computeClassRanking(rows: ClassPerformanceInput[]): ClassRankingEntry[] {
  const classMap = new Map<string, { total: number; count: number }>()
  for (const row of rows) {
    const existing = classMap.get(row.className)
    if (existing) {
      existing.total += row.percentage
      existing.count += 1
    } else {
      classMap.set(row.className, { total: row.percentage, count: 1 })
    }
  }

  const entries = [...classMap.entries()]
    .map(([name, data]) => ({
      name,
      performance: Math.round((data.total / data.count) * 10) / 10,
      students: data.count,
    }))
    .sort((a, b) => b.performance - a.performance || a.name.localeCompare(b.name))

  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }))
}