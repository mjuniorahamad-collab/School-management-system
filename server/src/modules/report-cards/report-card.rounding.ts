// Exact-rational decimal arithmetic for the Annual Report Card (docs/report-card.md §5).
//
// The annual calculation must round half-up to 2 decimal places using exact
// decimal (rational) arithmetic. The results module's `roundScore` deliberately
// uses `Math.round((value + Number.EPSILON) * factor)`, which operates on binary
// floats and cannot honour the spec's acceptance cases (e.g. `1.005 -> 1.01`).
// The Report Card therefore owns this small exact-rational module instead; the
// Result Sheet and its rounding are untouched (§17).
//
// Every stored mark is a DECIMAL(7,2) value, whose exact value is available as a
// decimal string. A rational is a pair of BigInts `{ n, d }` in lowest terms with
// `d > 0`, so no step in the pipeline ever introduces a binary-float error.

export interface Rational {
  /** Numerator (signed). */
  readonly n: bigint
  /** Denominator, always strictly positive. */
  readonly d: bigint
}

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a
  let y = b < 0n ? -b : b
  while (y !== 0n) {
    const t = x % y
    x = y
    y = t
  }
  return x
}

/** Builds a reduced rational with a positive denominator. */
export function makeRational(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new RangeError("A rational denominator must not be zero")
  let numerator = n
  let denominator = d
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }
  const divisor = gcd(numerator, denominator) || 1n
  return { n: numerator / divisor, d: denominator / divisor }
}

/**
 * Parses an exact decimal string (the form Prisma returns for DECIMAL columns)
 * into a rational. Rejects anything that is not a plain decimal — no exponent,
 * no whitespace-embedded value, no `NaN`/`Infinity`.
 */
export function parseDecimal(input: string): Rational {
  const trimmed = input.trim()
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new RangeError(`Invalid decimal value "${input}"`)
  }
  const negative = trimmed.startsWith("-")
  const unsigned = negative ? trimmed.slice(1) : trimmed
  const [intPart = "0", fracPart = ""] = unsigned.split(".")
  const digits = `${intPart}${fracPart}`
  const denominator = 10n ** BigInt(fracPart.length)
  const numerator = BigInt(digits.length === 0 ? "0" : digits)
  return makeRational(negative ? -numerator : numerator, denominator)
}

export function addRational(a: Rational, b: Rational): Rational {
  return makeRational(a.n * b.d + b.n * a.d, a.d * b.d)
}

export function subRational(a: Rational, b: Rational): Rational {
  return makeRational(a.n * b.d - b.n * a.d, a.d * b.d)
}

export function mulRational(a: Rational, b: Rational): Rational {
  return makeRational(a.n * b.n, a.d * b.d)
}

export function divRational(a: Rational, b: Rational): Rational {
  if (b.n === 0n) throw new RangeError("Division by zero rational")
  return makeRational(a.n * b.d, a.d * b.n)
}

/** Returns -1, 0 or 1 for `a < b`, `a === b`, `a > b`. */
export function compareRational(a: Rational, b: Rational): -1 | 0 | 1 {
  const left = a.n * b.d
  const right = b.n * a.d
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

export function isPositiveRational(value: Rational): boolean {
  return value.n > 0n
}

export function absRational(value: Rational): Rational {
  return value.n < 0n ? { n: -value.n, d: value.d } : value
}

/**
 * Rounds to `places` decimal places, half away from zero, over the exact value.
 *
 * The result has a denominator dividing `10^places`, so it is directly
 * serialisable through {@link toFixedDecimal}. `100/3 -> 33.33`,
 * `200/3 -> 66.67`, `89.995 -> 90.00`, `40.005 -> 40.01`.
 */
export function roundHalfUp(value: Rational, places = 2): Rational {
  const scale = 10n ** BigInt(places)
  const scaledNumerator = value.n * scale
  const negative = scaledNumerator < 0n
  const magnitude = negative ? -scaledNumerator : scaledNumerator
  const quotient = magnitude / value.d
  const remainder = magnitude % value.d
  const rounded = remainder * 2n >= value.d ? quotient + 1n : quotient
  return makeRational(negative ? -rounded : rounded, scale)
}

/**
 * Formats an already-rounded rational (whose denominator divides `10^places`)
 * as a fixed-point decimal string. Rounds first so the function is total.
 */
export function toFixedDecimal(value: Rational, places = 2): string {
  const rounded = roundHalfUp(value, places)
  const scale = 10n ** BigInt(places)
  const scaled = (rounded.n * scale) / rounded.d
  const negative = scaled < 0n
  const digits = (negative ? -scaled : scaled).toString().padStart(places + 1, "0")
  const integerPart = digits.slice(0, digits.length - places) || "0"
  const fractionPart = places > 0 ? digits.slice(digits.length - places) : ""
  return `${negative ? "-" : ""}${integerPart}${places > 0 ? `.${fractionPart}` : ""}`
}

/** Coerces a rational to a JS number for display only; the string is canonical. */
export function rationalToNumber(value: Rational): number {
  return Number(value.n) / Number(value.d)
}

// ────────────────────────────────────────────────────────────────────────────
// Weight validation (docs/report-card.md §5)
// ────────────────────────────────────────────────────────────────────────────

/** The spec tolerance `Σw = 1 ± 0.0001`, as an exact rational. */
export const WEIGHT_SUM_TOLERANCE: Rational = makeRational(1n, 10000n)

export function sumRationals(values: readonly Rational[]): Rational {
  return values.reduce((acc, value) => addRational(acc, value), makeRational(0n, 1n))
}

/**
 * Validates a set of exam weights: every weight strictly positive and the sum
 * within `1 ± 0.0001`. Returns a human-readable reason when invalid, else null.
 */
export function validateExamWeights(weights: readonly Rational[]): string | null {
  if (weights.length === 0) return "Exam weights are required for percentage-weighted aggregation"
  if (weights.some((weight) => !isPositiveRational(weight))) {
    return "Every exam weight must be strictly positive"
  }
  const total = sumRationals(weights)
  const deviation = absRational(subRational(total, makeRational(1n, 1n)))
  if (compareRational(deviation, WEIGHT_SUM_TOLERANCE) > 0) {
    return `Exam weights must sum to 1 (±0.0001); got ${toFixedDecimal(total, 4)}`
  }
  return null
}
