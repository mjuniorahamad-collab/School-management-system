import { z } from "zod"

// Shared decimal-safe money handling for the Fees/Payments/Receipts modules.
//
// All monetary columns are stored as `Decimal(12, 2)`; Prisma exposes them as
// Decimal objects and the services coerce them to plain numbers via `toMoney`.
// Arithmetic in services stays within safe-integer territory (school fees), so
// plain number addition is acceptable as long as every externally-supplied
// amount passes `moneySchema` (positive, at most two decimal places).

/** Rounds a float to exactly two decimal places (money-safe). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Coerces a Prisma Decimal (or string/raw number) to a JS number. Prisma returns
 * DECIMAL columns as Decimal objects whose `toString()` is the exact value.
 */
export function toMoney(value: unknown): number {
  if (typeof value === "number") return value
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isNaN(parsed)) throw new RangeError(`Invalid amount "${value}"`)
    return parsed
  }
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toString?: unknown }).toString === "function"
  ) {
    return toMoney((value as { toString(): string }).toString())
  }
  throw new RangeError(`Cannot convert value of type ${typeof value} to an amount`)
}

const MAX_MONEY = 9_999_999_999.99

/**
 * Zod schema for money values supplied across the API boundary. Positive and
 * limited to two decimal places (matching the `Decimal(12, 2)` columns).
 */
export const moneySchema = z
  .number()
  .positive("Amount must be a positive number")
  .max(MAX_MONEY, "Amount is too large")
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Amount must have at most two decimal places",
  })