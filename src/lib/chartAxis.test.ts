import { describe, expect, it } from "vitest"
import { niceAxisMax } from "./chartAxis"

describe("niceAxisMax", () => {
  it("returns 0 for empty, zero, negative or non-finite input", () => {
    expect(niceAxisMax(0)).toBe(0)
    expect(niceAxisMax(-5)).toBe(0)
    expect(niceAxisMax(Number.NaN)).toBe(0)
    expect(niceAxisMax(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it("rounds a normal maximum up to a readable currency bound", () => {
    // 71,500 must not produce the awkward ₹78.7K top tick.
    expect(niceAxisMax(71_500)).toBe(100_000)
    expect(niceAxisMax(5_000)).toBe(5_000)
    expect(niceAxisMax(2_500)).toBe(2_500)
  })

  it("handles very small positive amounts", () => {
    expect(niceAxisMax(1)).toBe(1)
    expect(niceAxisMax(3)).toBe(5)
    expect(niceAxisMax(12)).toBe(20)
  })
})
