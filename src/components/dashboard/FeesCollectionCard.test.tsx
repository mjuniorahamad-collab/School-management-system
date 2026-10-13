// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { FeesCollectionCard } from "@/components/dashboard/FeesCollectionCard"
import { formatINR } from "@/lib/format"

// DOM test for the Fees Collection empty-chart state.
//
// The card keeps two independent facts apart: the headline total (the full
// academic-session collection) and the visible bars (the selected period's
// buckets). A session can legitimately have a nonzero total but no buckets in
// the displayed window, so an empty chart is NOT an analytics failure. These
// tests pin the filter-specific copy and prove the nonzero headline still
// renders — the headline must never be swapped for the error state.
//
// The data hook is the seam: mocking it keeps the test free of a
// QueryClientProvider, services and a router while still exercising the real
// card markup and the real Tabs. `useTheme` is mocked because the card reads it
// for chart colours even though the chart is not rendered when there is no data.

const { feeAnalyticsMock } = vi.hoisted(() => ({ feeAnalyticsMock: vi.fn() }))

vi.mock("@/hooks/useDashboardData", () => ({ useFeeAnalytics: feeAnalyticsMock }))
vi.mock("@/theme/useTheme", () => ({
  useTheme: () => ({ isDark: false }),
}))

function zeroMonths() {
  return [
    { label: "Wk 1", collected: 0 },
    { label: "Wk 2", collected: 0 },
    { label: "Wk 3", collected: 0 },
    { label: "Wk 4", collected: 0 },
    { label: "Wk 5", collected: 0 },
  ]
}

beforeEach(() => {
  feeAnalyticsMock.mockReturnValue({
    data: {
      totalCollected: 71500,
      trendPercent: -100,
      comparison: "vs last month",
      months: zeroMonths(),
    },
    isPending: false,
    isError: false,
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Radix TabsTrigger activates on a left mousedown (automatic activation mode),
// not on a plain click.
function selectPeriod(name: string) {
  fireEvent.mouseDown(screen.getByRole("tab", { name }), { button: 0 })
}

describe("FeesCollectionCard empty chart state", () => {
  it("session (default) explains the window while keeping the nonzero headline", () => {
    render(<FeesCollectionCard />)

    expect(screen.getByText("No collections in the last 6 months")).toBeTruthy()
    expect(screen.getByText(formatINR(71500))).toBeTruthy()
    expect(screen.queryByText(/could not load fee analytics/i)).toBeNull()
  })

  it("month shows the month-scoped message", () => {
    render(<FeesCollectionCard />)

    selectPeriod("This Month")

    expect(screen.getByText("No collections this month")).toBeTruthy()
    expect(screen.queryByText(/could not load fee analytics/i)).toBeNull()
  })

  it("year shows the year-scoped message", () => {
    render(<FeesCollectionCard />)

    selectPeriod("This Year")

    expect(screen.getByText("No collections this year")).toBeTruthy()
    expect(screen.queryByText(/could not load fee analytics/i)).toBeNull()
  })
})
