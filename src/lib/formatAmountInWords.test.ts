import { describe, expect, it } from "vitest"
import { formatAmountInWords } from "@/lib/format"

// The printed words on a receipt/invoice must agree with the printed figure to
// the last digit. `formatINR` renders with `maximumFractionDigits: 0`, so the
// formatter rounds the same way; these tests pin that agreement at the boundaries
// where an off-by-one in lakh/crore splitting would show up on paper.
describe("formatAmountInWords", () => {
  it("spells zero", () => {
    expect(formatAmountInWords(0)).toBe("Zero Rupees only")
  })

  it("uses the singular currency label for a single unit", () => {
    expect(formatAmountInWords(1)).toBe("One Rupee only")
  })

  it("spells the teens and tens", () => {
    expect(formatAmountInWords(2)).toBe("Two Rupees only")
    expect(formatAmountInWords(10)).toBe("Ten Rupees only")
    expect(formatAmountInWords(11)).toBe("Eleven Rupees only")
    expect(formatAmountInWords(19)).toBe("Nineteen Rupees only")
    expect(formatAmountInWords(20)).toBe("Twenty Rupees only")
    expect(formatAmountInWords(21)).toBe("Twenty-One Rupees only")
    expect(formatAmountInWords(99)).toBe("Ninety-Nine Rupees only")
  })

  it("spells hundreds", () => {
    expect(formatAmountInWords(100)).toBe("One Hundred Rupees only")
    expect(formatAmountInWords(101)).toBe("One Hundred One Rupees only")
    expect(formatAmountInWords(110)).toBe("One Hundred Ten Rupees only")
    expect(formatAmountInWords(999)).toBe("Nine Hundred Ninety-Nine Rupees only")
  })

  it("spells thousands with a hyphenated compound", () => {
    expect(formatAmountInWords(1000)).toBe("One Thousand Rupees only")
    expect(formatAmountInWords(25000)).toBe("Twenty-Five Thousand Rupees only")
  })

  it("splits lakh correctly", () => {
    expect(formatAmountInWords(100_000)).toBe("One Lakh Rupees only")
    expect(formatAmountInWords(125_000)).toBe("One Lakh Twenty-Five Thousand Rupees only")
    // 99,999,999 must be nine crore ninety-nine lakh ninety-nine thousand, never
    // "Ten Crore" — the classic off-by-one when the split runs the wrong way.
    expect(formatAmountInWords(99_999_999)).toBe(
      "Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine Rupees only",
    )
  })

  it("splits crore correctly", () => {
    expect(formatAmountInWords(10_000_000)).toBe("One Crore Rupees only")
    expect(formatAmountInWords(12_345_678)).toBe(
      "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Rupees only",
    )
  })

  it("handles a negative amount as a credit", () => {
    expect(formatAmountInWords(-500)).toBe("Minus Five Hundred Rupees only")
  })

  it("rounds to the nearest rupee, matching formatINR's zero fraction digits", () => {
    expect(formatAmountInWords(0.4)).toBe("Zero Rupees only")
    expect(formatAmountInWords(0.6)).toBe("One Rupee only")
    expect(formatAmountInWords(125_000.4)).toBe("One Lakh Twenty-Five Thousand Rupees only")
    // Math.round is half-up, matching Intl's zero-fraction-digit rendering, so
    // .5 and .6 both land on 125001 — never on a value the figure disagrees with.
    expect(formatAmountInWords(125_000.5)).toBe("One Lakh Twenty-Five Thousand One Rupees only")
    expect(formatAmountInWords(125_000.6)).toBe("One Lakh Twenty-Five Thousand One Rupees only")
  })

  it("is deterministic and never mutates its input", () => {
    const amount = 125_000
    const first = formatAmountInWords(amount)
    const second = formatAmountInWords(amount)
    expect(first).toBe(second)
    expect(amount).toBe(125_000)
  })

  it("accepts an alternative currency label without changing the words", () => {
    expect(formatAmountInWords(1000, "USD")).toBe("One Thousand USD only")
    // Only a label ending in "s" is singularised, so a code like USD is left whole.
    expect(formatAmountInWords(1, "USD")).toBe("One USD only")
    expect(formatAmountInWords(1, "Dollars")).toBe("One Dollar only")
  })

  it("degrades visibly rather than throwing on a non-finite amount", () => {
    expect(formatAmountInWords(Number.NaN)).toBe("Rupees only")
    expect(formatAmountInWords(Number.POSITIVE_INFINITY)).toBe("Rupees only")
  })
})
