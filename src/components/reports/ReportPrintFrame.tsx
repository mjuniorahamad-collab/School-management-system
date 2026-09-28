import type { ReactNode } from "react"
import { PrintFooter, PrintLetterhead, PrintTitleBlock } from "@/components/print/PrintDocument"
import { PrintFieldGrid, type PrintField } from "@/components/print/PrintFields"
import { formatFullDate } from "@/lib/format"
import { PRINT_ONLY } from "@/lib/print"
import type { ReportCatalogItem, ReportData } from "@/types/reports"

/**
 * The printed identity of a Reports run.
 *
 * A report is the one artifact whose data is the SCREEN content — there is no
 * second copy of the rows to print from, because the report endpoint has already
 * shaped them for display. So this frame wraps the live report body rather than
 * duplicating it: the body renders on screen and on paper, and only the
 * letterhead, the title block and the repeating footer are print-only.
 *
 * `print-document` on the wrapper is what makes the body lay out as a page. That
 * class is defined solely inside `@media print`, so attaching it to a
 * screen-visible element changes nothing on screen.
 */
export function ReportPrintFrame({
  report,
  data,
  page,
  totalPages,
  children,
}: {
  report: ReportCatalogItem
  data: ReportData | undefined
  page: number
  totalPages: number
  children: ReactNode
}) {
  const fields = scopeFields(report, data)

  return (
    <section className="print-document">
      <div className={PRINT_ONLY}>
        <PrintLetterhead />
        <div className="mt-4">
          <PrintTitleBlock title={report.title} eyebrow="Report" subtitle={report.description} />
        </div>
        {fields.length > 0 && (
          <div className="mt-3">
            <PrintFieldGrid fields={fields} columns={3} />
          </div>
        )}
        <p className="print-document-note mt-3">{scopeNote(data, page, totalPages)}</p>
      </div>
      {children}
      <div className={PRINT_ONLY}>
        <PrintFooter documentTitle={report.title} />
      </div>
    </section>
  )
}

/**
 * The report's own scope, read from values the DTO already resolved.
 *
 * Never from the filter draft: those hold raw ids, and turning an id back into a
 * class or session name here would mean duplicating the lookup the server already
 * did. A filter the report does not echo is simply not claimed on paper.
 */
function scopeFields(
  report: ReportCatalogItem,
  data: ReportData | undefined,
): PrintField[] {
  if (data === undefined) return []

  switch (report.key) {
    case "student-roster": {
      const roster = data as Extract<ReportData, { pagination?: unknown }> & {
        session?: { name?: string }
        pagination?: { total?: number }
      }
      return dropEmpty([
        { label: "Session", value: roster.session?.name },
        { label: "Students in this report", value: numberText(roster.pagination?.total) },
      ])
    }
    case "admissions-summary": {
      const summary = data as { summary?: { from?: string; to?: string; total?: number } }
      return dropEmpty([
        { label: "From", value: dateText(summary.summary?.from) },
        { label: "To", value: dateText(summary.summary?.to) },
        { label: "Admissions in this period", value: numberText(summary.summary?.total) },
      ])
    }
    case "attendance-summary": {
      const attendance = data as {
        session?: { name?: string }
        from?: string
        to?: string
      }
      return dropEmpty([
        { label: "Session", value: attendance.session?.name },
        { label: "From", value: dateText(attendance.from) },
        { label: "To", value: dateText(attendance.to) },
      ])
    }
    case "academic-performance": {
      const performance = data as {
        exam?: { name?: string; className?: string; sectionName?: string | null }
      }
      return dropEmpty([
        { label: "Examination", value: performance.exam?.name },
        { label: "Class", value: performance.exam?.className },
        {
          label: "Section",
          value: performance.exam?.sectionName !== null && performance.exam?.sectionName !== undefined
            ? performance.exam.sectionName
            : "Whole class",
        },
      ])
    }
    case "fee-collection": {
      const fees = data as { session?: { name?: string } }
      return dropEmpty([{ label: "Session", value: fees.session?.name }])
    }
    case "payment-register": {
      const register = data as { summary?: { from?: string; to?: string; count?: number } }
      return dropEmpty([
        { label: "From", value: dateText(register.summary?.from) },
        { label: "To", value: dateText(register.summary?.to) },
        { label: "Payments in this period", value: numberText(register.summary?.count) },
      ])
    }
    default:
      return []
  }
}

/**
 * How complete the printed set is, and the honest limit of a browser print.
 *
 * A paginated report prints the page it is on, not the whole dataset — unlike the
 * circulation and transport registers, which walk the API first. That is stated
 * here so a reader is never left to assume a 2-page report is a 2-page class.
 */
function scopeNote(
  data: ReportData | undefined,
  page: number,
  totalPages: number,
): string {
  if (data === undefined) return ""

  const paginated = (data as { pagination?: { page?: number; total?: number; totalPages?: number } })
    .pagination

  if (paginated !== undefined) {
    return `Result set page ${page} of ${totalPages} — showing ${paginated.total ?? 0} record(s) in total. This sheet covers the page shown, not the whole result set.`
  }

  return "This sheet is the complete result of the filters that produced it. Figures are printed exactly as the server returned them; nothing here is recalculated."
}

function numberText(value: number | undefined): string | null {
  return typeof value === "number" ? String(value) : null
}

function dateText(value: string | undefined): string | null {
  return value === undefined || value === null || value === "" ? null : formatFullDate(value)
}

function dropEmpty(fields: PrintField[]): PrintField[] {
  return fields.filter((field) => field.value !== null && field.value !== undefined && field.value !== "")
}
