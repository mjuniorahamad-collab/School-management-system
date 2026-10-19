import { describe, expect, it } from "vitest"
import type { ReportCardSchemeDetail } from "@/types/reportCardScheme"
import {
  CLASS_SCOPE_KEY,
  SECTION_FILTER_ALL,
  SECTION_FILTER_CLASS,
  buildSchemeScopeNames,
  deriveScopeKey,
  describeSchemeScope,
  findSchemeForScope,
  matchesSchemeScope,
  matchesSectionFilter,
} from "./reportCardSchemeScope"

function scheme(overrides: Partial<ReportCardSchemeDetail>): ReportCardSchemeDetail {
  return {
    id: "scheme-1",
    academicSessionId: "sess-1",
    classId: "class-1",
    sectionId: null,
    scopeKey: CLASS_SCOPE_KEY,
    aggregationPolicy: "RAW",
    absencePolicy: "EXCLUDE_AND_REVIEW",
    overallPassMode: "ALL_SUBJECTS",
    annualSubjectPassPercent: "40",
    overallPassPercent: null,
    maxFailedSubjects: null,
    coreSubjectIds: [],
    publicationMode: "REQUIRE_DECISION",
    createdByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    exams: [],
    ...overrides,
  }
}

describe("deriveScopeKey", () => {
  it("returns the section id when a section is set", () => {
    expect(deriveScopeKey("section-9")).toBe("section-9")
  })

  it("returns the class-level sentinel for nullish/empty sections", () => {
    expect(deriveScopeKey(null)).toBe(CLASS_SCOPE_KEY)
    expect(deriveScopeKey(undefined)).toBe(CLASS_SCOPE_KEY)
    expect(deriveScopeKey("")).toBe(CLASS_SCOPE_KEY)
  })
})

describe("matchesSchemeScope", () => {
  it("matches on session + class + scope key", () => {
    const classLevel = scheme({ sectionId: null, scopeKey: CLASS_SCOPE_KEY })
    expect(
      matchesSchemeScope(classLevel, {
        academicSessionId: "sess-1",
        classId: "class-1",
        sectionId: null,
      }),
    ).toBe(true)
  })

  it("rejects a different section", () => {
    const sectionScheme = scheme({ sectionId: "section-9", scopeKey: "section-9" })
    expect(
      matchesSchemeScope(sectionScheme, {
        academicSessionId: "sess-1",
        classId: "class-1",
        sectionId: "section-2",
      }),
    ).toBe(false)
  })

  it("rejects a different session or class", () => {
    const base = scheme({})
    expect(
      matchesSchemeScope(base, { academicSessionId: "sess-2", classId: "class-1", sectionId: null }),
    ).toBe(false)
    expect(
      matchesSchemeScope(base, { academicSessionId: "sess-1", classId: "class-2", sectionId: null }),
    ).toBe(false)
  })

  it("does not treat a class-level scheme as matching an explicit section", () => {
    const classLevel = scheme({ sectionId: null })
    expect(
      matchesSchemeScope(classLevel, {
        academicSessionId: "sess-1",
        classId: "class-1",
        sectionId: "section-9",
      }),
    ).toBe(false)
  })
})

describe("findSchemeForScope", () => {
  it("finds the exact scope among many schemes", () => {
    const items = [
      scheme({ id: "a", sectionId: null }),
      scheme({ id: "b", sectionId: "section-9", scopeKey: "section-9" }),
    ]
    const found = findSchemeForScope(items, {
      academicSessionId: "sess-1",
      classId: "class-1",
      sectionId: "section-9",
    })
    expect(found?.id).toBe("b")
  })

  it("returns undefined when no scheme matches", () => {
    expect(
      findSchemeForScope([scheme({ sectionId: null })], {
        academicSessionId: "sess-1",
        classId: "class-1",
        sectionId: "section-9",
      }),
    ).toBeUndefined()
  })
})

describe("matchesSectionFilter", () => {
  it("keeps everything for the all sentinel", () => {
    expect(matchesSectionFilter({ sectionId: null }, SECTION_FILTER_ALL)).toBe(true)
    expect(matchesSectionFilter({ sectionId: "section-9" }, SECTION_FILTER_ALL)).toBe(true)
  })

  it("keeps only class-level schemes for the class sentinel", () => {
    expect(matchesSectionFilter({ sectionId: null }, SECTION_FILTER_CLASS)).toBe(true)
    expect(matchesSectionFilter({ sectionId: "section-9" }, SECTION_FILTER_CLASS)).toBe(false)
  })

  it("keeps only the matching section and excludes the class-level fallback", () => {
    expect(matchesSectionFilter({ sectionId: "section-9" }, "section-9")).toBe(true)
    expect(matchesSectionFilter({ sectionId: "section-2" }, "section-9")).toBe(false)
    expect(matchesSectionFilter({ sectionId: null }, "section-9")).toBe(false)
  })
})

describe("describeSchemeScope", () => {
  const names = buildSchemeScopeNames(
    [
      { id: "class-1", name: "Grade 5" },
      { id: "class-2", name: "Grade 6" },
    ],
    [
      { id: "section-9", name: "A" },
      { id: "section-2", name: "B" },
    ],
  )

  it("labels a section scheme with class and section names", () => {
    expect(describeSchemeScope({ classId: "class-1", sectionId: "section-9" }, names)).toBe(
      "Grade 5 · Section A",
    )
  })

  it("labels a class-level scheme", () => {
    expect(describeSchemeScope({ classId: "class-1", sectionId: null }, names)).toBe(
      "Grade 5 · Class-level",
    )
  })

  it("falls back without leaking raw ids for unknown entries", () => {
    expect(describeSchemeScope({ classId: "class-x", sectionId: null }, names)).toBe(
      "Unknown class · Class-level",
    )
    expect(describeSchemeScope({ classId: "class-1", sectionId: "section-x" }, names)).toBe(
      "Grade 5 · Unknown section",
    )
  })
})
