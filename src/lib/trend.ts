import type { TrendTone } from "@/types"

// Shared trend sign → tone/arrow/colour mapping. Extracted from StatCard so the
// dashboard's trend badges (StatCard and FeesCollectionCard) cannot drift into
// contradictory styling — a negative trend must never render green with an
// upward arrow.

export type TrendDirection = "up" | "down"

export interface TrendMeta {
  tone: TrendTone
  direction: TrendDirection
  className: string
}

/**
 * Maps a percentage trend to its presentation. Negative is red with a downward
 * arrow; zero and positive keep the established non-negative (emerald, up)
 * styling, matching the `+` sign prefix used by the trend badges.
 */
export function trendMeta(trend: number): TrendMeta {
  if (trend < 0) {
    return {
      tone: "negative",
      direction: "down",
      className: "text-red-600 bg-red-50 dark:bg-red-500/15 dark:text-red-300",
    }
  }
  return {
    tone: "positive",
    direction: "up",
    className: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15 dark:text-emerald-300",
  }
}
