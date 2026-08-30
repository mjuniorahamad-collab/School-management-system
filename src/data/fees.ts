import type { FeeAnalytics, FeePeriod } from "@/types"

// TEMPORARY MOCK DATA — dashboard milestone only.
// Illustrative fee collection analytics; will be replaced by the Fees API.

export const feeAnalyticsData: Record<FeePeriod, FeeAnalytics> = {
  month: {
    totalCollected: 345000,
    trendPercent: 6.4,
    comparison: "vs last month",
    months: [
      { label: "Wk 1", collected: 42000 },
      { label: "Wk 2", collected: 68000 },
      { label: "Wk 3", collected: 91000 },
      { label: "Wk 4", collected: 82000 },
      { label: "Wk 5", collected: 62000 },
      { label: "Wk 6", collected: 0 },
    ],
  },
  session: {
    totalCollected: 1245000,
    trendPercent: 18.7,
    comparison: "vs last session",
    months: [
      { label: "Apr", collected: 160000 },
      { label: "May", collected: 210000 },
      { label: "Jun", collected: 185000 },
      { label: "Jul", collected: 245000 },
      { label: "Aug", collected: 275000 },
      { label: "Sep", collected: 170000 },
    ],
  },
  year: {
    totalCollected: 2830000,
    trendPercent: 22.1,
    comparison: "vs last year",
    months: [
      { label: "Jan", collected: 430000 },
      { label: "Feb", collected: 510000 },
      { label: "Mar", collected: 485000 },
      { label: "Apr", collected: 420000 },
      { label: "May", collected: 505000 },
      { label: "Jun", collected: 480000 },
    ],
  },
}