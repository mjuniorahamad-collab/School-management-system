import { describe, expect, it } from "vitest"
import { PERMISSION_CODES } from "../src/permissions/permissions.js"
import { REPORT_CATALOG, getReportDefinition } from "../src/modules/reports/report.catalog.js"
import { monthKeyOf, ratioPercent, summarizeAttendanceCounts } from "../src/modules/reports/report.rules.js"
import {
  academicPerformanceToCsv,
  admissionsSummaryToCsv,
  attendanceSummaryToCsv,
  feeCollectionToCsv,
  paymentRegisterToCsv,
  reportFileName,
  reportToCsv,
  studentRosterToCsv,
} from "../src/modules/reports/report.csv.js"
import type { AttendanceSummaryReport } from "../src/modules/reports/report.types.js"

describe("report.rules (pure report calculations)", () => {
  it("ratios a part to a whole as a 1-decimal percentage", () => {
    expect(ratioPercent(25, 100)).toBe(25)
    expect(ratioPercent(1, 3)).toBe(33.3)
    expect(ratioPercent(0, 0)).toBe(0)
  })

  it("summarizes attendance counts with the dashboard present-rate semantics", () => {
    const summary = summarizeAttendanceCounts({ PRESENT: 8, LATE: 2, ABSENT: 2, HOLIDAY: 3 })
    expect(summary.present).toBe(8)
    expect(summary.late).toBe(2)
    expect(summary.absent).toBe(2)
    expect(summary.holiday).toBe(3)
    expect(summary.total).toBe(15)
    // HOLIDAY is excluded from the attended-vs-absent denominator.
    expect(summary.presentRate).toBe(83.3)
  })

  it("treats missing status counts as zero", () => {
    const summary = summarizeAttendanceCounts({})
    expect(summary).toEqual({ present: 0, late: 0, absent: 0, holiday: 0, total: 0, presentRate: 0 })
  })

  it("buckets a UTC date into YYYY-MM", () => {
    expect(monthKeyOf(new Date("2026-07-05T10:00:00.000Z"))).toBe("2026-07")
    expect(monthKeyOf(new Date("2026-01-31T23:00:00.000Z"))).toBe("2026-01")
  })
})

describe("report catalog (registry integrity)", () => {
  it("registers exactly the six approved V1 reports with unique keys", () => {
    expect(REPORT_CATALOG).toHaveLength(6)
    const keys = REPORT_CATALOG.map((entry) => entry.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toEqual(
      expect.arrayContaining([
        "student-roster",
        "admissions-summary",
        "attendance-summary",
        "academic-performance",
        "fee-collection",
        "payment-register",
      ]),
    )
  })

  it("only references existing permission codes from the canonical catalog", () => {
    const valid = new Set(PERMISSION_CODES)
    for (const entry of REPORT_CATALOG) {
      expect(entry.requiredPermission.length).toBeGreaterThan(0)
      for (const code of entry.requiredPermission) {
        expect(valid.has(code as (typeof PERMISSION_CODES)[number])).toBe(true)
      }
    }
  })

  it("resolves every catalog key through getReportDefinition", () => {
    for (const entry of REPORT_CATALOG) {
      expect(getReportDefinition(entry.key)?.title).toBe(entry.title)
    }
    expect(getReportDefinition("not-a-report")).toBeUndefined()
  })
})

describe("report.csv (export serialization)", () => {
  it("produces deterministic, BOM-prefixed, CRLF documents", () => {
    const item = {
      receiptId: "r1",
      receiptNumber: "RCP-001",
      paymentDate: "2026-07-01",
      studentName: "Amara, Aisha",
      admissionNumber: "ADM-1",
      invoiceNumber: "INV-1",
      className: "Grade 4",
      sectionName: null,
      sessionName: "2026",
      method: "CASH",
      amount: 1200.5,
      balanceAfter: 0,
      transactionRef: null,
    }
    const csv = paymentRegisterToCsv([item])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain("\r\n")
    expect(csv).toContain('"Amara, Aisha"')
    expect(csv).toContain('"1200.50"')
    expect(csv).toContain('""')
  })

  it("exports the attendance split across class and daily scopes", () => {
    const report: AttendanceSummaryReport = {
      session: { id: "s", name: "2026" },
      from: "2026-01-01",
      to: "2026-12-31",
      summary: { present: 8, late: 2, absent: 2, holiday: 3, total: 15, presentRate: 83.3 },
      classes: [
        {
          classId: "c1",
          className: "Grade 4",
          sectionId: null,
          sectionName: null,
          present: 8,
          late: 2,
          absent: 2,
          holiday: 0,
          total: 12,
          presentRate: 83.3,
        },
      ],
      daily: [
        { date: "2026-07-01", present: 5, late: 1, absent: 0, holiday: 0, total: 6, presentRate: 100 },
      ],
    }
    const csv = attendanceSummaryToCsv(report)
    expect(csv).toContain('"Class"')
    expect(csv).toContain('"Daily"')
    expect(csv).toContain('"Grade 4"')
    expect(csv).toContain('"2026-07-01"')
  })

  it("routes full-report exports through reportToCsv by key", () => {
    const fullSerializers: string[] = [
      "admissions-summary",
      "attendance-summary",
      "academic-performance",
      "fee-collection",
    ]
    for (const key of fullSerializers) {
      const csv = reportToCsv(key as "admissions-summary" | "attendance-summary" | "academic-performance" | "fee-collection", validReportFixture(key))
      expect(typeof csv).toBe("string")
      expect(csv.endsWith("\r\n")).toBe(true)
    }
    expect(fullSerializers).toHaveLength(4)
  })

  it("builds a scoped, dated export file name", () => {
    expect(reportFileName("student-roster", "2026-09-06")).toBe("student-roster-2026-09-06.csv")
  })
})

function validReportFixture(key: string): AttendanceSummaryReport {
  // All report CSV serializers accept either their typed report shape or a
  // structural stand-in; attendance is the only shape shared across every
  // dispatcher branch, so exercise them all against it.
  const report: AttendanceSummaryReport = {
    session: { id: "s", name: "2026" },
    from: "2026-01-01",
    to: "2026-12-31",
    summary: { present: 0, late: 0, absent: 0, holiday: 0, total: 0, presentRate: 0 },
    classes: [],
    daily: [],
  }
  switch (key) {
    case "admissions-summary":
      return {
        ...report,
        summary: {
          from: "2026-01-01",
          to: "2026-12-31",
          total: 0,
          converted: 0,
          conversionRate: 0,
          statusCounts: {},
        },
        items: [],
      } as unknown as AttendanceSummaryReport
    case "academic-performance":
      return {
        exam: {
          id: "e",
          name: "Term 1",
          status: "FINAL",
          examTypeName: "Term Exam",
          className: "Grade 4",
          sectionName: null,
          publishedAt: null,
          finalizedAt: null,
        },
        summary: { students: 0, completeStudents: 0, averagePercentage: null, passCount: 0, passRate: null, subjects: [] },
        classes: [],
        items: [],
      } as unknown as AttendanceSummaryReport
    case "fee-collection":
      return {
        session: { id: "s", name: "2026" },
        summary: { invoiceCount: 0, invoiced: 0, collected: 0, outstanding: 0, collectionRate: 0 },
        items: [],
      } as unknown as AttendanceSummaryReport
    default:
      return report
  }
}

// Keep the individual CSV helpers covered too.
describe("report.csv (individual serializers)", () => {
  it("serializes the student roster with fixed columns", () => {
    const csv = studentRosterToCsv([
      {
        studentId: "st1",
        admissionNumber: "ADM-10",
        name: "Amara Kone",
        classId: "c1",
        className: "Grade 4",
        sectionId: "sec1",
        sectionName: "A",
        gender: "FEMALE",
        status: "ACTIVE",
        email: null,
        phone: "123",
        city: null,
        state: null,
        admissionDate: "2026-01-05",
      },
    ])
    expect(csv).toContain('"Admission Number"')
    expect(csv).toContain('"ADM-10"')
  })

  it("serializes the fee collection report with money fixed to two decimals", () => {
    const csv = feeCollectionToCsv({
      session: { id: "s", name: "2026" },
      summary: { invoiceCount: 1, invoiced: 1200.5, collected: 500, outstanding: 700.5, collectionRate: 41.6 },
      items: [
        {
          invoiceId: "i1",
          invoiceNumber: "INV-1",
          studentId: "st1",
          studentName: "Amara Kone",
          admissionNumber: "ADM-10",
          className: "Grade 4",
          sectionName: "A",
          sessionName: "2026",
          totalAmount: 1200.5,
          amountPaid: 500,
          balance: 700.5,
          status: "PARTIAL",
          nextDueDate: "2026-09-30",
        },
      ],
    })
    expect(csv).toContain('"1200.50"')
    expect(csv).toContain('"PARTIAL"')
    expect(csv).toContain('"2026-09-30"')
  })

  it("serializes the academic performance report as empty strings for null marks", () => {
    const csv = academicPerformanceToCsv({
      exam: {
        id: "e",
        name: "Term 1",
        status: "FINAL",
        examTypeName: "Term Exam",
        className: "Grade 4",
        sectionName: "A",
        publishedAt: "2026-06-20",
        finalizedAt: "2026-06-25",
      },
      summary: { students: 1, completeStudents: 0, averagePercentage: null, passCount: 0, passRate: null, subjects: [] },
      classes: [],
      items: [
        {
          studentId: "st1",
          admissionNumber: "ADM-10",
          studentName: "Amara Kone",
          className: "Grade 4",
          sectionName: "A",
          rank: null,
          totalObtained: null,
          totalMaxMarks: null,
          totalPercentage: null,
          grade: null,
          isPass: null,
        },
      ],
    })
    expect(csv).toContain('"ADM-10"')
    expect(csv).toContain('"",')
  })

  it("serializes the admissions summary with status columns", () => {
    const csv = admissionsSummaryToCsv({
      summary: {
        from: "2026-01-01",
        to: "2026-06-30",
        total: 3,
        converted: 1,
        conversionRate: 33.3,
        statusCounts: { PENDING: 1, CONVERTED: 1, REJECTED: 1 },
      },
      items: [
        { month: "2026-01", total: 2, statusCounts: { PENDING: 1, CONVERTED: 1 } },
        { month: "2026-02", total: 1, statusCounts: { REJECTED: 1 } },
      ],
    })
    expect(csv).toContain('"Month"')
    expect(csv).toContain('"2026-01","2","1"')
  })
})