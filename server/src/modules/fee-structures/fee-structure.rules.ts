import { roundMoney } from "../../lib/money.js"

/**
 * Sums fee structure item amounts into a money-safe total. Item amounts arrive
 * through the validated API boundary (max two decimals) so plain addition is
 * exact enough after a final money rounding.
 */
export function sumItemAmounts(items: readonly { amount: number }[]): number {
  return roundMoney(items.reduce((sum, item) => sum + item.amount, 0))
}

/** Throws when the same fee head appears more than once in a structure. */
export function assertUniqueFeeHeadIds(feeHeadIds: readonly string[]): void {
  if (new Set(feeHeadIds).size !== feeHeadIds.length) {
    throw new Error("A fee head may only appear once per fee structure")
  }
}

export function assertItemsNonEmpty(itemCount: number): void {
  if (itemCount < 1) {
    throw new Error("A fee structure must contain at least one item")
  }
}