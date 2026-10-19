// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReportCardPrintDocument } from "@/components/reportCards/ReportCardPrintDocument"
import { branding } from "@/config/branding"
import type { ReportCardSnapshotV2 } from "@/types/reportCard"

// The document must render the FROZEN school identity it is given, never live
// tenant branding; the hook is mocked as unresolved so the build-time fallback is
// the only thing that could show through if the override were ignored.
vi.mock("@/hooks/useBranding", () => ({ useBranding: () => ({ data: undefined }) }))

afterEach(cleanup)

function v2Snapshot(overrides: Partial<ReportCardSnapshotV2> = {}): ReportCardSnapshotV2 {
  return {
    schemaVersion: 2,
    schoolId: "school-1",
    studentId: "student-1",
    academicSessionId: "session-1",
    classId: "class-1",
    sectionId: "section-1",
    school: {
      id: "school-1",
      schoolName: "Frozen High School",
      tagline: "Frozen tagline",
      schoolShortName: "FHS",
      contactPhone: "+1 555 0100",
      contactEmail: "office@frozen.example",
      addressLine1: "1 Frozen Street",
      addressLine2: null,
      city: "Frozentown",
      state: "FS",
      postalCode: "0001",
      country: "Frozenland",
    },
    student: {
      id: "student-1",
      admissionNumber: "ADM-001",
      firstName: "Ada",
      middleName: "B",
      lastName: "Lovelace",
    },
    session: { id: "session-1", name: "2025-2026" },
    class: { id: "class-1", name: "Grade 10" },
    section: { id: "section-1", name: "A" },
    scheme: {
      id: "scheme-1",
      scopeKey: "class:class-1",
      aggregationPolicy: "RAW",
      absencePolicy: "EXCLUDE_AND_REVIEW",
      overallPassMode: "ALL_SUBJECTS",
      annualSubjectPassPercent: "33",
      overallPassPercent: "40",
      maxFailedSubjects: 1,
      coreSubjectIds: ["s-math"],
      gradingBands: [
        { minPercent: 90, maxPercent: 100, grade: "A1" },
        { minPercent: 0, maxPercent: 89, grade: "B" },
      ],
      exams: [{ examTypeId: "et-1", weight: "100" }],
    },
    examResolutions: [
      {
        examTypeId: "et-1",
        examTypeName: "Final",
        examId: "exam-1",
        examName: "Annual Final",
        examStartDate: "2026-03-01",
        examEndDate: "2026-03-05",
        status: "RESOLVED",
        reason: null,
      },
    ],
    subjects: [
      {
        subjectId: "s-math",
        subjectName: "Mathematics",
        isCore: true,
        outcome: "PASS",
        percentage: "82.5",
        grade: "A1",
        reason: null,
        includedExamIds: ["exam-1"],
        excludedExamIds: [],
        absentExamIds: [],
        marks: [{ examId: "exam-1", maxMarks: "100", obtainedMarks: "82.5", status: "SCORED" }],
      },
      {
        subjectId: "s-hist",
        subjectName: "History",
        isCore: false,
        outcome: "REQUIRES_REVIEW",
        percentage: null,
        grade: null,
        reason: "PENDING_OR_MISSING_MARKS",
        includedExamIds: [],
        excludedExamIds: [],
        absentExamIds: [],
        marks: [{ examId: "exam-1", maxMarks: "100", obtainedMarks: null, status: "PENDING" }],
      },
    ],
    overall: {
      result: "PASS",
      percentage: "82.5",
      failedCount: 0,
      resolvedSubjectCount: 2,
      requiresReview: true,
    },
    signatories: [
      { role: "Class Teacher", name: "Mrs. Smith" },
      { role: "Principal", name: "Dr. Jones" },
    ],
    ...overrides,
  }
}

describe("ReportCardPrintDocument", () => {
  it("prints the frozen school identity in the letterhead and footer, never live branding", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.querySelector(".print-document-school-name")?.textContent).toBe(
      "Frozen High School",
    )
    expect(container.querySelector(".print-document-footer")?.textContent).toContain(
      "Frozen High School",
    )
    expect(container.textContent).not.toContain(branding.schoolName)
  })

  it("prints the frozen student, placement and session identity", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).toContain("Ada B Lovelace")
    expect(container.textContent).toContain("ADM-001")
    expect(container.textContent).toContain("Grade 10")
    expect(container.textContent).toContain("2025-2026")
  })

  it("prints the frozen overall result and percentage verbatim", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).toContain("Pass")
    expect(container.textContent).toContain("82.5%")
    expect(container.textContent).toContain("Flagged for review")
  })

  it("prints per-exam obtained/maximum marks and never turns a missing mark into zero", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).toContain("82.5 / 100")
    // The pending subject had no obtained marks; its frozen status must be shown,
    // not a fabricated "0 / 100".
    expect(container.textContent).toContain("Pending")
    expect(container.textContent).not.toContain("0 / 100")
  })

  it("prints the frozen subject names, outcomes and grading bands", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).toContain("Mathematics")
    expect(container.textContent).toContain("History")
    expect(container.textContent).toContain("A1")
    expect(container.textContent).toContain("Grading scale")
  })

  it("prints the frozen exam resolutions with their names", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).toContain("Exam resolutions")
    expect(container.textContent).toContain("Annual Final")
    expect(container.textContent).toContain("Resolved")
  })

  it("prints the frozen signatory roles and names", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).toContain("Mrs. Smith")
    expect(container.textContent).toContain("Class Teacher")
    expect(container.textContent).toContain("Dr. Jones")
    expect(container.textContent).toContain("Principal")
  })

  it("never prints an issue date or an overall grade", () => {
    const { container } = render(<ReportCardPrintDocument snapshot={v2Snapshot()} />)

    expect(container.textContent).not.toMatch(/issued/i)
    expect(container.textContent).not.toMatch(/overall grade/i)
  })
})
