// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ReportResult } from "@/components/reports/ReportResult"
import { printDocument } from "@/lib/print"
import type { ReportCatalogItem } from "@/types/reports"

vi.mock("@/lib/print", () => ({
  printDocument: vi.fn(),
  PRINT_HIDDEN: "print:hidden",
  PRINT_ONLY: "hidden print:block",
  PRINT_DOCUMENT_CLASS: "print-document",
  PRINT_MAX_ROWS: 500,
  PRINT_MARGIN_MM: 14,
  PRINT_MARGIN_MM_LANDSCAPE: 12,
  PRINT_PAGE_SIZE: "A4",
  PRINT_PAGE_SIZE_PARAM: 100,
  printPageRuleForTest: vi.fn(),
}))

const report: ReportCatalogItem = {
  key: "student-roster",
  title: "Student Roster",
  group: "academic",
  description: "Every student in the selected scope.",
}

function renderResult(overrides: Partial<React.ComponentProps<typeof ReportResult>> = {}) {
  return render(
    <ReportResult
      report={report}
      data={undefined}
      isPending={false}
      isError={false}
      onRetry={() => {}}
      canExport={false}
      canPrint
      exportHref={null}
      page={1}
      totalPages={1}
      onPageChange={() => {}}
      {...overrides}
    />,
  )
}

describe("ReportResult print action", () => {
  beforeEach(() => {
    vi.mocked(printDocument).mockClear()
  })

  afterEach(() => {
    // vitest runs without `globals: true`, so Testing Library's automatic
    // cleanup hook is never registered and renders would otherwise accumulate
    // across tests in this file.
    cleanup()
  })

  it("prints through the shared foundation instead of calling window.print directly", () => {
    renderResult()

    fireEvent.click(screen.getByRole("button", { name: /print/i }))

    expect(printDocument).toHaveBeenCalledWith({ title: "Student Roster" })
  })

  it("hides the print action from actors without the report read permission", () => {
    // Decision D1: printing is gated on the permission of the artifact being
    // printed, never on a dedicated `*:print` permission. canPrint is the
    // caller's `can("reports:view")`.
    renderResult({ canPrint: false })

    expect(screen.queryByRole("button", { name: /print/i })).toBeNull()
  })

  it("keeps the action row out of the printed page", () => {
    // The screen toolbar and pagination are chrome; the data table is not.
    const { container } = renderResult()

    expect(container.querySelectorAll(".print\\:hidden").length).toBeGreaterThan(0)
  })
})
