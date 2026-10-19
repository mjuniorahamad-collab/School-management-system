// Database-free tests for the Annual Report Card snapshot v2 contract
// (docs/report-card.md 8a). `buildSnapshotV2` is a pure projection and
// `validateFrozenSignatories` is the single signatory acceptance rule shared by
// the generation and publication gates. Neither touches Prisma, so this suite
// never imports a live client and never connects.

import { describe, expect, it } from "vitest"

import {
  buildSnapshotV2,
  validateFrozenSignatories,
  type BuildSnapshotV2Input,
} from "../src/modules/report-cards/report-card.snapshot-v2.js"
import { MAX_REPORT_CARD_SIGNATORIES } from "../src/lib/school-settings.js"

const TYPE_1 = "00000000-0000-4000-8000-0000000000f1"
const TYPE_2 = "00000000-0000-4000-8000-0000000000f2"
const SUBJECT_1 = "00000000-0000-4000-8000-0000000020f1"
const SUBJECT_2 = "00000000-0000-4000-8000-0000000020f2"

function baseInput(overrides: Partial<BuildSnapshotV2Input> = {}): BuildSnapshotV2Input {
  return {
    schoolId: "school",
    studentId: "student",
    academicSessionId: "session",
    classId: "class",
    sectionId: null,
    school: {
      id: "school",
      schoolName: "Bright Future International School",
      tagline: "Aim Higher",
      schoolShortName: "BFIS",
      contactPhone: "+91-123",
      contactEmail: "office@bfis.example",
      addressLine1: "1 Main Rd",
      addressLine2: null,
      city: "Pune",
      state: "MH",
      postalCode: "411001",
      country: "India",
    },
    student: {
      id: "student",
      admissionNumber: "ADM-0001",
      firstName: "Aria",
      middleName: null,
      lastName: "Khan",
    },
    session: { id: "session", name: "2026-2027" },
    class: { id: "class", name: "Grade 1" },
    section: null,
    scheme: {
      id: "scheme",
      scopeKey: "class",
      aggregationPolicy: "RAW",
      absencePolicy: "EXCLUDE_AND_REVIEW",
      overallPassMode: "ALL_SUBJECTS",
      annualSubjectPassPercent: "40",
      overallPassPercent: null,
      maxFailedSubjects: null,
      coreSubjectIds: [],
      gradingBands: [{ minPercent: 0, maxPercent: 100, grade: "A" }],
      exams: [],
    },
    examResolutions: [],
    subjects: [],
    overall: {
      result: "PASS",
      percentage: "75.00",
      failedCount: 0,
      resolvedSubjectCount: 2,
      requiresReview: false,
    },
    signatories: [{ role: "Principal", name: "Dr. Rao" }],
    ...overrides,
  }
}

describe("buildSnapshotV2 (database-free)", () => {
  it("stamps the v2 schema version and carries identity and placement", () => {
    const snapshot = buildSnapshotV2(baseInput())
    expect(snapshot.schemaVersion).toBe(2)
    expect(snapshot.school.id).toBe("school")
    expect(snapshot.school.schoolName).toBe("Bright Future International School")
    expect(snapshot.student.admissionNumber).toBe("ADM-0001")
    expect(snapshot.session).toEqual({ id: "session", name: "2026-2027" })
    expect(snapshot.class).toEqual({ id: "class", name: "Grade 1" })
    expect(snapshot.section).toBeNull()
  })

  it("is deterministic for identical input", () => {
    const input = baseInput()
    expect(buildSnapshotV2(input)).toEqual(buildSnapshotV2(input))
  })

  it("canonically sorts core subjects, scheme exams, resolutions, subjects and marks", () => {
    const snapshot = buildSnapshotV2(
      baseInput({
        sectionId: "section",
        section: { id: "section", name: "A" },
        scheme: {
          ...baseInput().scheme,
          coreSubjectIds: [SUBJECT_2, SUBJECT_1],
          exams: [
            { examTypeId: TYPE_2, weight: "1" },
            { examTypeId: TYPE_1, weight: "2" },
          ],
        },
        examResolutions: [
          {
            examTypeId: TYPE_2,
            examTypeName: "Term 2",
            examId: null,
            examName: null,
            examStartDate: null,
            examEndDate: null,
            status: "NOT_SCHEDULED",
            reason: null,
          },
          {
            examTypeId: TYPE_1,
            examTypeName: "Term 1",
            examId: "e1",
            examName: "Term 1 Exam",
            examStartDate: "2026-03-01",
            examEndDate: "2026-03-05",
            status: "RESOLVED",
            reason: null,
          },
        ],
        subjects: [
          {
            subjectId: SUBJECT_2,
            subjectName: "Science",
            isCore: false,
            outcome: "PASS",
            percentage: "80",
            grade: "A",
            reason: null,
            includedExamIds: ["e2", "e1"],
            excludedExamIds: [],
            absentExamIds: [],
            marks: [
              { examId: "e2", maxMarks: "100", obtainedMarks: "80", status: "SCORED" },
              { examId: "e1", maxMarks: "100", obtainedMarks: "70", status: "SCORED" },
            ],
          },
          {
            subjectId: SUBJECT_1,
            subjectName: "Mathematics",
            isCore: true,
            outcome: "PASS",
            percentage: "75",
            grade: "A",
            reason: null,
            includedExamIds: ["e1"],
            excludedExamIds: [],
            absentExamIds: [],
            marks: [{ examId: "e1", maxMarks: "100", obtainedMarks: "75", status: "SCORED" }],
          },
        ],
      }),
    )

    expect(snapshot.section).toEqual({ id: "section", name: "A" })
    expect(snapshot.scheme.coreSubjectIds).toEqual([SUBJECT_1, SUBJECT_2])
    expect(snapshot.scheme.exams.map((exam) => exam.examTypeId)).toEqual([TYPE_1, TYPE_2])
    expect(snapshot.examResolutions.map((entry) => entry.examTypeId)).toEqual([TYPE_1, TYPE_2])
    expect(snapshot.subjects.map((subject) => subject.subjectId)).toEqual([SUBJECT_1, SUBJECT_2])
    const science = snapshot.subjects.find((subject) => subject.subjectId === SUBJECT_2)!
    expect(science.marks.map((mark) => mark.examId)).toEqual(["e1", "e2"])
    expect(science.includedExamIds).toEqual(["e1", "e2"])
  })

  it("copies only canonical branding fields and never the whole school row", () => {
    const snapshot = buildSnapshotV2(
      baseInput({
        school: {
          ...baseInput().school,
          // Extra properties a live row might carry must not leak into the hash.
          ...({ registrationNumber: "SECRET", createdAt: "2020-01-01" } as object),
        },
      }),
    )
    expect(Object.keys(snapshot.school).sort()).toEqual(
      [
        "addressLine1",
        "addressLine2",
        "city",
        "contactEmail",
        "contactPhone",
        "country",
        "id",
        "postalCode",
        "schoolName",
        "schoolShortName",
        "state",
        "tagline",
      ].sort(),
    )
  })
})

describe("validateFrozenSignatories (database-free)", () => {
  it("treats absent and empty values as MISSING", () => {
    expect(validateFrozenSignatories(null)).toEqual({ ok: false, reason: "MISSING" })
    expect(validateFrozenSignatories(undefined)).toEqual({ ok: false, reason: "MISSING" })
    expect(validateFrozenSignatories([])).toEqual({ ok: false, reason: "MISSING" })
  })

  it("treats non-arrays and oversized lists as CORRUPT", () => {
    expect(validateFrozenSignatories({ role: "x", name: "y" })).toEqual({
      ok: false,
      reason: "CORRUPT",
    })
    expect(validateFrozenSignatories("nope")).toEqual({ ok: false, reason: "CORRUPT" })
    const tooMany = Array.from({ length: MAX_REPORT_CARD_SIGNATORIES + 1 }, (_, index) => ({
      role: "r",
      name: `n${index}`,
    }))
    expect(validateFrozenSignatories(tooMany)).toEqual({ ok: false, reason: "CORRUPT" })
  })

  it("treats malformed entries and blank fields as CORRUPT", () => {
    expect(validateFrozenSignatories([null])).toEqual({ ok: false, reason: "CORRUPT" })
    expect(validateFrozenSignatories(["Principal"])).toEqual({ ok: false, reason: "CORRUPT" })
    expect(validateFrozenSignatories([{ role: "", name: "Dr. Rao" }])).toEqual({
      ok: false,
      reason: "CORRUPT",
    })
    expect(validateFrozenSignatories([{ role: "Principal", name: "   " }])).toEqual({
      ok: false,
      reason: "CORRUPT",
    })
    expect(validateFrozenSignatories([{ role: 7, name: "Dr. Rao" }])).toEqual({
      ok: false,
      reason: "CORRUPT",
    })
  })

  it("accepts a valid list and trims each field", () => {
    const result = validateFrozenSignatories([
      { role: " Principal ", name: " Dr. Rao " },
      { role: "Class Teacher", name: "Ms. A. Sharma" },
    ])
    expect(result).toEqual({
      ok: true,
      signatories: [
        { role: "Principal", name: "Dr. Rao" },
        { role: "Class Teacher", name: "Ms. A. Sharma" },
      ],
    })
  })
})
