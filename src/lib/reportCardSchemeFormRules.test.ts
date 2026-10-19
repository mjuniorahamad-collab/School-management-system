import { describe, expect, it } from "vitest"
import type { ReportCardSchemeDetail } from "@/types/reportCardScheme"
import {
  defaultReportCardSchemeForm,
  emptyReportCardSchemeForm,
  reportCardSchemeFormToPayload,
  schemeDetailToFormValue,
  validateReportCardSchemeForm,
  type ReportCardSchemeFormValue,
} from "./reportCardSchemeFormRules"

function baseValue(overrides: Partial<ReportCardSchemeFormValue> = {}): ReportCardSchemeFormValue {
  return {
    academicSessionId: "sess-1",
    classId: "class-1",
    sectionId: "",
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: "40",
    overallPassPercent: "",
    maxFailedSubjects: "",
    coreSubjectIds: [],
    exams: [exam("et-1")],
    ...overrides,
  }
}

function exam(examTypeId: string, weight = "", key = examTypeId) {
  return { key, examTypeId, weight }
}

function fieldErrors(value: ReportCardSchemeFormValue): string[] {
  return validateReportCardSchemeForm(value).map((error) => error.field)
}

describe("defaultReportCardSchemeForm", () => {
  it("starts with sensible defaults and can be pre-scoped", () => {
    const form = defaultReportCardSchemeForm({ academicSessionId: "sess-9", classId: "class-9" })
    expect(form.aggregationPolicy).toBe("RAW")
    expect(form.absencePolicy).toBe("EXCLUDE_AND_REVIEW")
    expect(form.overallPassMode).toBe("ALL_SUBJECTS")
    expect(form.sectionId).toBe("")
    expect(form.academicSessionId).toBe("sess-9")
    expect(form.classId).toBe("class-9")
    expect(form.exams).toHaveLength(1)
  })

  it("emptyReportCardSchemeForm leaves scope blank", () => {
    expect(emptyReportCardSchemeForm().academicSessionId).toBe("")
  })
})

describe("validateReportCardSchemeForm — core", () => {
  it("accepts a complete RAW class-level scheme", () => {
    const value = baseValue({ exams: [exam("et-1")] })
    expect(validateReportCardSchemeForm(value)).toEqual([])
  })

  it("requires session, class and annual percentage", () => {
    const value = baseValue({
      academicSessionId: "",
      classId: "",
      annualSubjectPassPercent: "",
    })
    expect(fieldErrors(value)).toEqual(
      expect.arrayContaining(["academicSessionId", "classId", "annualSubjectPassPercent"]),
    )
  })

  it("enforces the annual percentage bounds", () => {
    expect(fieldErrors(baseValue({ annualSubjectPassPercent: "120" }))).toContain(
      "annualSubjectPassPercent",
    )
    expect(fieldErrors(baseValue({ annualSubjectPassPercent: "-1" }))).toContain(
      "annualSubjectPassPercent",
    )
    expect(fieldErrors(baseValue({ annualSubjectPassPercent: "abc" }))).toContain(
      "annualSubjectPassPercent",
    )
  })
})

describe("validateReportCardSchemeForm — exams", () => {
  it("rejects empty exam selection", () => {
    expect(fieldErrors(baseValue({ exams: [exam("")] }))).toContain("exams")
  })

  it("rejects a missing exam list", () => {
    expect(fieldErrors(baseValue({ exams: [] }))).toContain("exams")
  })

  it("rejects duplicate exam types", () => {
    expect(
      fieldErrors(baseValue({ exams: [exam("et-1", "0.5", "a"), exam("et-1", "0.5", "b")] })),
    ).toContain("exams")
  })

  it("ignores weights under RAW", () => {
    expect(validateReportCardSchemeForm(baseValue({ exams: [exam("et-1")] }))).toEqual([])
  })

  it("requires strictly positive weights summing to 1 for PERCENTAGE_WEIGHTED", () => {
    const weighted = (weights: string[]) =>
      fieldErrors(
        baseValue({
          aggregationPolicy: "PERCENTAGE_WEIGHTED",
          exams: weights.map((w, i) => exam(`et-${i}`, w, `row-${i}`)),
        }),
      )

    expect(weighted(["0.5", "0.5"])).not.toContain("exams")
    expect(weighted(["0.5"])).toContain("exams")
    expect(weighted(["0.5", "0.4"])).toContain("exams")
    expect(weighted(["0", "1"])).toContain("exams")
    expect(weighted(["-0.1", "1.1"])).toContain("exams")
    expect(weighted(["", "1"])).toContain("exams")
  })

  it("tolerates the weight sum within 1 ± 0.0001", () => {
    expect(
      fieldErrors(
        baseValue({
          aggregationPolicy: "PERCENTAGE_WEIGHTED",
          exams: [exam("et-1", "0.5", "a"), exam("et-2", "0.50005", "b")],
        }),
      ),
    ).not.toContain("exams")
  })
})

describe("validateReportCardSchemeForm — overall pass modes", () => {
  it("ALL_SUBJECTS rejects percent/maxFailed/core", () => {
    const errors = fieldErrors(
      baseValue({
        overallPassMode: "ALL_SUBJECTS",
        overallPassPercent: "35",
        maxFailedSubjects: "2",
        coreSubjectIds: ["sub-1"],
      }),
    )
    expect(errors).toEqual(
      expect.arrayContaining(["overallPassPercent", "maxFailedSubjects", "coreSubjectIds"]),
    )
  })

  it("PERCENT_AND_MAX_FAILED requires percent and an integer maxFailed", () => {
    expect(
      fieldErrors(
        baseValue({
          overallPassMode: "PERCENT_AND_MAX_FAILED",
          overallPassPercent: "",
          maxFailedSubjects: "",
        }),
      ),
    ).toEqual(expect.arrayContaining(["overallPassPercent", "maxFailedSubjects"]))

    expect(
      fieldErrors(
        baseValue({
          overallPassMode: "PERCENT_AND_MAX_FAILED",
          overallPassPercent: "35",
          maxFailedSubjects: "1.5",
        }),
      ),
    ).toContain("maxFailedSubjects")

    expect(
      validateReportCardSchemeForm(
        baseValue({
          overallPassMode: "PERCENT_AND_MAX_FAILED",
          overallPassPercent: "35",
          maxFailedSubjects: "2",
        }),
      ),
    ).toEqual([])
  })

  it("CORE_SUBJECTS_AND_PERCENT requires a percent and at least one core subject", () => {
    expect(
      fieldErrors(baseValue({ overallPassMode: "CORE_SUBJECTS_AND_PERCENT" })),
    ).toEqual(expect.arrayContaining(["overallPassPercent", "coreSubjectIds"]))

    expect(
      validateReportCardSchemeForm(
        baseValue({
          overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
          overallPassPercent: "35",
          coreSubjectIds: ["sub-1", "sub-2"],
        }),
      ),
    ).toEqual([])

    expect(
      fieldErrors(
        baseValue({
          overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
          overallPassPercent: "35",
          coreSubjectIds: ["sub-1", "sub-1"],
        }),
      ),
    ).toContain("coreSubjectIds")
  })
})

describe("reportCardSchemeFormToPayload", () => {
  it("omits weights and section for a RAW class-level scheme and trims decimals", () => {
    const payload = reportCardSchemeFormToPayload(
      baseValue({
        sectionId: "",
        annualSubjectPassPercent: " 40.5 ",
        exams: [exam("et-1", "0.9", "a"), exam("et-2", "", "b")],
      }),
    )
    expect(payload.sectionId).toBeNull()
    expect(payload.annualSubjectPassPercent).toBe("40.5")
    expect(payload.exams).toEqual([
      { examTypeId: "et-1", sortOrder: 0 },
      { examTypeId: "et-2", sortOrder: 1 },
    ])
  })

  it("includes weights for PERCENTAGE_WEIGHTED", () => {
    const payload = reportCardSchemeFormToPayload(
      baseValue({
        aggregationPolicy: "PERCENTAGE_WEIGHTED",
        exams: [exam("et-1", "0.25", "a"), exam("et-2", "0.75", "b")],
      }),
    )
    expect(payload.exams).toEqual([
      { examTypeId: "et-1", sortOrder: 0, weight: "0.25" },
      { examTypeId: "et-2", sortOrder: 1, weight: "0.75" },
    ])
  })

  it("emits only the conditional overall-pass fields for each mode", () => {
    const percentAndMax = reportCardSchemeFormToPayload(
      baseValue({
        overallPassMode: "PERCENT_AND_MAX_FAILED",
        overallPassPercent: "35",
        maxFailedSubjects: "2",
        coreSubjectIds: ["sub-1"],
      }),
    )
    expect(percentAndMax.overallPassPercent).toBe("35")
    expect(percentAndMax.maxFailedSubjects).toBe(2)
    expect(percentAndMax.coreSubjectIds).toEqual([])

    const core = reportCardSchemeFormToPayload(
      baseValue({
        overallPassMode: "CORE_SUBJECTS_AND_PERCENT",
        overallPassPercent: "35",
        coreSubjectIds: ["sub-1", "sub-2"],
      }),
    )
    expect(core.overallPassPercent).toBe("35")
    expect(core.maxFailedSubjects).toBeUndefined()
    expect(core.coreSubjectIds).toEqual(["sub-1", "sub-2"])

    const all = reportCardSchemeFormToPayload(baseValue({ overallPassMode: "ALL_SUBJECTS" }))
    expect(all.overallPassPercent).toBeUndefined()
    expect(all.maxFailedSubjects).toBeUndefined()
    expect(all.coreSubjectIds).toBeUndefined()
  })

  it("keeps an explicit section id", () => {
    const payload = reportCardSchemeFormToPayload(baseValue({ sectionId: "section-9" }))
    expect(payload.sectionId).toBe("section-9")
  })
})

describe("schemeDetailToFormValue", () => {
  const detail: ReportCardSchemeDetail = {
    id: "sch-1",
    academicSessionId: "sess-1",
    classId: "class-1",
    sectionId: null,
    scopeKey: "__CLASS__",
    aggregationPolicy: "PERCENTAGE_WEIGHTED",
    absencePolicy: "TREAT_SUBJECT_AS_FAILED",
    overallPassMode: "PERCENT_AND_MAX_FAILED",
    annualSubjectPassPercent: "40",
    overallPassPercent: "35",
    maxFailedSubjects: 2,
    coreSubjectIds: [],
    publicationMode: "REQUIRE_DECISION",
    createdByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    exams: [
      { id: "e-1", examTypeId: "et-1", examTypeName: "Mid", weight: "0.5", sortOrder: 0 },
      { id: "e-2", examTypeId: "et-2", examTypeName: "Final", weight: "0.5", sortOrder: 1 },
    ],
  }

  it("maps an authoritative detail into form values", () => {
    const form = schemeDetailToFormValue(detail)
    expect(form.sectionId).toBe("")
    expect(form.overallPassPercent).toBe("35")
    expect(form.maxFailedSubjects).toBe("2")
    expect(form.exams).toEqual([
      { key: "e-1", examTypeId: "et-1", weight: "0.5" },
      { key: "e-2", examTypeId: "et-2", weight: "0.5" },
    ])
  })

  it("represents null optional fields as empty strings and seeds one row when empty", () => {
    const form = schemeDetailToFormValue({
      ...detail,
      overallPassPercent: null,
      maxFailedSubjects: null,
      exams: [],
    })
    expect(form.overallPassPercent).toBe("")
    expect(form.maxFailedSubjects).toBe("")
    expect(form.exams).toHaveLength(1)
  })

  it("round-trips through the payload without loss for a section scheme", () => {
    const form = schemeDetailToFormValue({ ...detail, sectionId: "section-9" })
    const payload = reportCardSchemeFormToPayload(form)
    expect(payload.sectionId).toBe("section-9")
    expect(payload.overallPassPercent).toBe("35")
    expect(payload.maxFailedSubjects).toBe(2)
  })
})
