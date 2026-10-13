import { describe, expect, it } from "vitest"
import { trendMeta } from "./trend"

describe("trendMeta", () => {
  it("maps a negative trend to a red badge and a downward arrow", () => {
    const meta = trendMeta(-100)
    expect(meta.tone).toBe("negative")
    expect(meta.direction).toBe("down")
    expect(meta.className).toContain("text-red-600")
    expect(meta.className).not.toContain("emerald")
  })

  it("maps a positive trend to an emerald badge and an upward arrow", () => {
    const meta = trendMeta(6.4)
    expect(meta.tone).toBe("positive")
    expect(meta.direction).toBe("up")
    expect(meta.className).toContain("text-emerald-600")
  })

  it("treats a zero trend as non-negative (emerald, up)", () => {
    const meta = trendMeta(0)
    expect(meta.tone).toBe("positive")
    expect(meta.direction).toBe("up")
    expect(meta.className).toContain("text-emerald-600")
  })
})
