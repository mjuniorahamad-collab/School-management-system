import { describe, expect, it } from "vitest"
import {
  buildReportCardLabelMaps,
  canDownloadReportCardArchive,
  describeReportCardGeneration,
  describeReportCardScope,
  formatReportCardCount,
  formatReportCardPercentage,
  reportCardExamTypeName,
  reportCardSessionName,
  reportCardSubjectName,
  sortReportCardsByVersionDesc,
  type ReportCardLabelMaps,
} from "./reportCardLifecycle"

const maps: ReportCardLabelMaps = buildReportCardLabelMaps({
  sessions: [{ id: "sess-1", name: "2025-2026" }],
  classes: [{ id: "cls-1", name: "Class 5" }],
  sections: [{ id: "sec-1", name: "A" }],
  subjects: [{ id: "sub-1", name: "Mathematics" }],
  examTypes: [{ id: "et-1", name: "Term 1" }],
})

describe("buildReportCardLabelMaps", () => {
  it("builds maps from the provided sources and tolerates omission", () => {
    expect(maps.sessionNames.get("sess-1")).toBe("2025-2026")
    expect(maps.subjectNames.get("sub-1")).toBe("Mathematics")
    const empty = buildReportCardLabelMaps({})
    expect(empty.classNames.size).toBe(0)
  })
})

describe("name resolution falls back safely", () => {
  it("resolves known names", () => {
    expect(reportCardSessionName("sess-1", maps)).toBe("2025-2026")
    expect(reportCardSubjectName("sub-1", maps)).toBe("Mathematics")
    expect(reportCardExamTypeName("et-1", maps)).toBe("Term 1")
  })

  it("never surfaces a raw id for an unknown id", () => {
    expect(reportCardSessionName("missing", maps)).toBe("Unknown session")
    expect(reportCardSubjectName("missing", maps)).toBe("Unknown subject")
    expect(reportCardExamTypeName("missing", maps)).toBe("Unknown exam type")
  })

  it("handles null/undefined ids", () => {
    expect(reportCardSessionName(null, maps)).toBe("—")
    expect(reportCardSubjectName(undefined, maps)).toBe("Unknown subject")
    expect(reportCardExamTypeName(null, maps)).toBe("Unknown exam type")
  })
})

describe("describeReportCardScope", () => {
  it("labels a class-level scope", () => {
    expect(describeReportCardScope({ classId: "cls-1", sectionId: null }, maps)).toBe("Class 5")
  })

  it("labels a section scope", () => {
    expect(describeReportCardScope({ classId: "cls-1", sectionId: "sec-1" }, maps)).toBe(
      "Class 5 · Section A",
    )
  })

  it("falls back for unknown class and section without leaking ids", () => {
    expect(describeReportCardScope({ classId: "x", sectionId: null }, maps)).toBe("Unknown class")
    expect(describeReportCardScope({ classId: "cls-1", sectionId: "y" }, maps)).toBe(
      "Class 5 · Unknown section",
    )
    expect(describeReportCardScope({ classId: "x", sectionId: "y" }, maps)).toBe(
      "Unknown class · Unknown section",
    )
  })
})

describe("canDownloadReportCardArchive", () => {
  it("allows only statuses that can carry an archive", () => {
    expect(canDownloadReportCardArchive("PENDING_ARCHIVE")).toBe(true)
    expect(canDownloadReportCardArchive("ISSUED")).toBe(true)
    expect(canDownloadReportCardArchive("SUPERSEDED")).toBe(true)
  })

  it("rejects draft/void/unknown", () => {
    expect(canDownloadReportCardArchive("DRAFT")).toBe(false)
    expect(canDownloadReportCardArchive("VOID")).toBe(false)
    expect(canDownloadReportCardArchive(null)).toBe(false)
    expect(canDownloadReportCardArchive(undefined)).toBe(false)
  })
})

describe("sortReportCardsByVersionDesc", () => {
  it("orders newest version first without mutating the input", () => {
    const input = [{ version: 1 }, { version: 3 }, { version: 2 }]
    const sorted = sortReportCardsByVersionDesc(input)
    expect(sorted.map((c) => c.version)).toEqual([3, 2, 1])
    expect(input.map((c) => c.version)).toEqual([1, 3, 2])
  })
})

describe("describeReportCardGeneration", () => {
  it("reports no constraints when there are no versions", () => {
    expect(describeReportCardGeneration([])).toEqual({
      hasActiveDraft: false,
      activeDraftVersion: null,
      latestVersion: null,
      latestStatus: null,
      requiresReissueReason: false,
    })
  })

  it("flags an active draft and blocks reissue reasoning for a new version", () => {
    const result = describeReportCardGeneration([
      { status: "DRAFT", version: 1 },
    ])
    expect(result.hasActiveDraft).toBe(true)
    expect(result.activeDraftVersion).toBe(1)
    expect(result.latestStatus).toBe("DRAFT")
    expect(result.requiresReissueReason).toBe(false)
  })

  it("requires a reissue reason when the latest version is published", () => {
    expect(describeReportCardGeneration([{ status: "PENDING_ARCHIVE", version: 2 }]).requiresReissueReason).toBe(true)
    expect(describeReportCardGeneration([{ status: "ISSUED", version: 2 }]).requiresReissueReason).toBe(true)
  })

  it("uses the highest version as latest even when input is unordered", () => {
    const result = describeReportCardGeneration([
      { status: "ISSUED", version: 1 },
      { status: "SUPERSEDED", version: 2 },
      { status: "DRAFT", version: 3 },
    ])
    expect(result.latestVersion).toBe(3)
    expect(result.latestStatus).toBe("DRAFT")
    expect(result.hasActiveDraft).toBe(true)
    expect(result.requiresReissueReason).toBe(false)
  })

  it("does not require a reason when the latest version is superseded", () => {
    const result = describeReportCardGeneration([{ status: "SUPERSEDED", version: 2 }])
    expect(result.requiresReissueReason).toBe(false)
    expect(result.hasActiveDraft).toBe(false)
  })
})

describe("formatting frozen values", () => {
  it("renders the server decimal verbatim with a percent suffix", () => {
    expect(formatReportCardPercentage("82.50")).toBe("82.50%")
    expect(formatReportCardPercentage("100.00")).toBe("100.00%")
  })

  it("uses an em-dash for missing values without inventing a number", () => {
    expect(formatReportCardPercentage(null)).toBe("—")
    expect(formatReportCardPercentage(undefined)).toBe("—")
    expect(formatReportCardPercentage("")).toBe("—")
  })

  it("formats counts and degrades safely", () => {
    expect(formatReportCardCount(3)).toBe("3")
    expect(formatReportCardCount(0)).toBe("0")
    expect(formatReportCardCount(null)).toBe("—")
    expect(formatReportCardCount(undefined)).toBe("—")
  })
})
