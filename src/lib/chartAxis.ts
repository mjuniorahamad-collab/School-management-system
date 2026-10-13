/**
 * Rounds a chart's data maximum up to a "nice" axis bound so tick labels stay
 * readable, e.g. 71,500 → 100,000 (₹0 / ₹25K / ₹50K / ₹75K / ₹1L) instead of
 * 78,650 (₹78.7K). Non-finite or non-positive inputs return 0, which callers
 * must treat as "no data" — render an empty state rather than a fabricated
 * `[0, 10]` axis.
 */
export function niceAxisMax(dataMax: number): number {
  if (!Number.isFinite(dataMax) || dataMax <= 0) return 0
  const magnitude = 10 ** Math.floor(Math.log10(dataMax))
  const normalized = dataMax / magnitude
  const step =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10
  return step * magnitude
}
