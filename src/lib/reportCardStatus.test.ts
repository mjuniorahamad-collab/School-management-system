import { describe, expect, it } from "vitest"
import {
  canAttachReportCardArchive,
  canIssueReportCard,
  canPublishReportCard,
  reportCardAnnualResultLabel,
  reportCardExamResolutionReasonLabel,
  reportCardExamResolutionStatusLabel,
  reportCardStatusLabel,
  reportCardSubjectOutcomeLabel,
  reportCardSubjectOutcomeReasonLabel,
} from "./reportCardStatus"

describe("reportCardStatusLabel", () => {
  it("maps every known status", () => {
    expect(reportCardStatusLabel("DRAFT")).toBe("Draft")
    expect(reportCardStatusLabel("PENDING_ARCHIVE")).toBe("Pending archive")
    expect(reportCardStatusLabel("ISSUED")).toBe("Issued")
    expect(reportCardStatusLabel("SUPERSEDED")).toBe("Superseded")
    expect(reportCardStatusLabel("VOID")).toBe("Void")
  })

  it("humanizes an unknown status", () => {
    expect(reportCardStatusLabel("SOMETHING_NEW")).toBe("Something New")
  })

  it("falls back for nullish/empty input", () => {
    expect(reportCardStatusLabel(null)).toBe("Unknown")
    expect(reportCardStatusLabel(undefined)).toBe("Unknown")
    expect(reportCardStatusLabel("")).toBe("Unknown")
  })
})

describe("outcome/result labels", () => {
  it("maps known annual results and humanizes unknown ones", () => {
    expect(reportCardAnnualResultLabel("PASS")).toBe("Pass")
    expect(reportCardAnnualResultLabel("REQUIRES_REVIEW")).toBe("Requires review")
    expect(reportCardAnnualResultLabel("BRAND_NEW")).toBe("Brand New")
  })

  it("maps known subject outcomes", () => {
    expect(reportCardSubjectOutcomeLabel("NOT_APPLICABLE")).toBe("Not applicable")
    expect(reportCardSubjectOutcomeLabel("FAIL")).toBe("Fail")
  })

  it("maps known subject outcome reasons and uses an em dash fallback", () => {
    expect(reportCardSubjectOutcomeReasonLabel("PENDING_OR_MISSING_MARKS")).toBe(
      "Pending or missing marks",
    )
    expect(reportCardSubjectOutcomeReasonLabel(null)).toBe("—")
  })

  it("maps known exam resolution statuses/reasons and humanizes unknown ones", () => {
    expect(reportCardExamResolutionStatusLabel("NOT_FINAL")).toBe("Not final")
    expect(reportCardExamResolutionStatusLabel("WEIRD")).toBe("Weird")
    expect(reportCardExamResolutionReasonLabel("CROSS_SECTION_DUPLICATE")).toBe(
      "Cross-section duplicate",
    )
    expect(reportCardExamResolutionReasonLabel(undefined)).toBe("—")
  })
})

describe("lifecycle predicates", () => {
  it("allows publishing only from DRAFT", () => {
    expect(canPublishReportCard("DRAFT")).toBe(true)
    expect(canPublishReportCard("PENDING_ARCHIVE")).toBe(false)
    expect(canPublishReportCard("ISSUED")).toBe(false)
    expect(canPublishReportCard("SUPERSEDED")).toBe(false)
    expect(canPublishReportCard("VOID")).toBe(false)
    expect(canPublishReportCard("BOGUS")).toBe(false)
    expect(canPublishReportCard(null)).toBe(false)
  })

  it("allows issuing only from PENDING_ARCHIVE", () => {
    expect(canIssueReportCard("PENDING_ARCHIVE")).toBe(true)
    expect(canIssueReportCard("DRAFT")).toBe(false)
    expect(canIssueReportCard("ISSUED")).toBe(false)
    expect(canIssueReportCard("BOGUS")).toBe(false)
    expect(canIssueReportCard(undefined)).toBe(false)
  })

  it("allows attaching an archive unless DRAFT/SUPERSEDED/VOID", () => {
    expect(canAttachReportCardArchive("PENDING_ARCHIVE")).toBe(true)
    expect(canAttachReportCardArchive("ISSUED")).toBe(true)
    expect(canAttachReportCardArchive("DRAFT")).toBe(false)
    expect(canAttachReportCardArchive("SUPERSEDED")).toBe(false)
    expect(canAttachReportCardArchive("VOID")).toBe(false)
    expect(canAttachReportCardArchive("BOGUS")).toBe(false)
  })
})
