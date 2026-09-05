export interface GradingBandRule {
  minPercent: number
  maxPercent: number
  grade: string
}

export interface GradedMark {
  examSubjectId: string
  obtainedMarks: number | null
  isAbsent: boolean
}

export interface ResultAggregateParams {
  /** Total number of subjects on the exam (the completeness denominator). */
  subjectCount: number
  /** maxMarks per subject id (Decimal coercion not needed — plain numbers in). */
  subjectMaxMarks: Record<string, number>
  /** passMarks per subject id. */
  subjectPassMarks: Record<string, number>
  marks: GradedMark[]
  bands: readonly GradingBandRule[]
}

export interface ResultAggregate {
  totalObtained: number | null
  totalMaxMarks: number | null
  totalPercentage: number | null
  grade: string | null
  isPass: boolean | null
  isComplete: boolean
}

export interface MarkDerivation {
  percentage: number | null
  grade: string | null
  isPass: boolean | null
}

/**
 * Per-subject mark derivation. Absent works and cleared cells (no marks) yield
 * null derivations — an absent subject is never recorded as a zero.
 */
export function deriveSubjectMark(opts: {
  obtainedMarks: number | null
  isAbsent: boolean
  maxMarks: number
  passMarks: number
  bands: readonly GradingBandRule[]
}): MarkDerivation {
  if (opts.isAbsent || opts.obtainedMarks === null) {
    return { percentage: null, grade: null, isPass: null }
  }
  const percentage = scorePercentage(opts.obtainedMarks, opts.maxMarks)
  return {
    percentage,
    grade: gradeForPercentage(percentage, opts.bands),
    isPass: isPassingScore(opts.obtainedMarks, opts.passMarks),
  }
}

/**
 * Student-level aggregate over every subject on the exam.
 *
 *   - `isComplete`: every subject has a mark, and none are absent/blank.
 *   - Totals run over the graded (non-absent) subjects only — absent subjects
 *     are excluded, never penalized as zeros.
 *   - `grade`/`isPass` are only meaningful for a complete set (left null
 *     otherwise), and a complete set passes only when every subject passed.
 */
export function computeResultAggregate(params: ResultAggregateParams): ResultAggregate {
  const scored = params.marks.filter((mark) => !mark.isAbsent && mark.obtainedMarks !== null)
  const isComplete =
    params.marks.length === params.subjectCount &&
    scored.length === params.subjectCount

  if (!isComplete || scored.length === 0) {
    return {
      totalObtained: null,
      totalMaxMarks: null,
      totalPercentage: null,
      grade: null,
      isPass: null,
      isComplete: false,
    }
  }

  const totalObtained = scored.reduce(
    (sum, mark) => sum + (mark.obtainedMarks as number),
    0,
  )
  const totalMaxMarks = scored.reduce(
    (sum, mark) => sum + (params.subjectMaxMarks[mark.examSubjectId] ?? 0),
    0,
  )
  if (totalMaxMarks <= 0) {
    return {
      totalObtained: null,
      totalMaxMarks: null,
      totalPercentage: null,
      grade: null,
      isPass: null,
      isComplete: false,
    }
  }

  const totalPercentage = roundScore((totalObtained / totalMaxMarks) * 100)
  const passedEverySubject = scored.every((mark) => {
    const passMarks = params.subjectPassMarks[mark.examSubjectId]
    return passMarks !== undefined && isPassingScore(mark.obtainedMarks as number, passMarks)
  })

  return {
    totalObtained: roundScore(totalObtained),
    totalMaxMarks: roundScore(totalMaxMarks),
    totalPercentage,
    grade: gradeForPercentage(totalPercentage, params.bands),
    isPass: passedEverySubject,
    isComplete: true,
  }
}

/** Rounds to the given number of decimal places (banker-friendly halves via EPSILON). */
export function roundScore(value: number, places = 2): number {
  const factor = 10 ** places
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/** Percentage of a score, rounded to 2dp. Throws when `max` is not positive. */
export function scorePercentage(obtained: number, max: number): number {
  if (!Number.isFinite(obtained) || !Number.isFinite(max) || max <= 0) {
    throw new RangeError("maxMarks and obtainedMarks must be finite positive numbers")
  }
  return roundScore((obtained / max) * 100)
}

/** Pass/fail per subject: a score passes when it meets or beats the pass mark. */
export function isPassingScore(obtained: number, passMarks: number): boolean {
  return obtained >= passMarks
}

/**
 * Maps a percentage to a letter grade using the tenant's GradingBand rows.
 * Band bounds are inclusive integers; the percentage is rounded to a whole
 * number before lookup (matches the GradingBand `minPercent`/`maxPercent`
 * Int columns). Returns null when no band covers the value.
 */
export function gradeForPercentage(
  percentage: number,
  bands: readonly GradingBandRule[],
): string | null {
  const target = Math.round(percentage)
  for (const band of bands) {
    if (target >= band.minPercent && target <= band.maxPercent) return band.grade
  }
  return null
}

/**
 * Coerces a Prisma Decimal (or string/raw number) to a JS number. Prisma returns
 * DECIMAL columns as Decimal objects whose `toString()` is the exact value.
 */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isNaN(parsed)) throw new RangeError(`Invalid numeric value "${value}"`)
    return parsed
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toString?: unknown }).toString === "function"
  ) {
    return toNumber((value as { toString(): string }).toString())
  }
  throw new RangeError(`Cannot convert value of type ${typeof value} to a number`)
}