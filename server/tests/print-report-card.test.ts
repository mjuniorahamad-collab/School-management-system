import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

// Source contracts for the printed Annual Report Card.
//
// A report card is a historical document: it must render the values frozen into
// its snapshot, never live student/class/subject/exam rows, and it must reuse the
// shared print foundation rather than growing a second print path. JSDOM can render
// the component but cannot see which data source it reads, and it cannot evaluate
// the print stylesheet, so the load-bearing facts are pinned here as source text.

const readSource = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, "../..", relative), "utf8")

const documentSource = readSource("src/components/reportCards/ReportCardPrintDocument.tsx")
const pageSource = readSource("src/pages/reportCards/ReportCardDetailPage.tsx")
const printDocumentSource = readSource("src/components/print/PrintDocument.tsx")

describe("report card print document reuses the shared print foundation", () => {
  it("builds on the shared PrintDocument and primitives", () => {
    for (const primitive of [
      "PrintDocument",
      "PrintFieldGrid",
      "PrintSection",
      "PrintTable",
      "PrintTotals",
      "PrintSignatureRow",
    ]) {
      expect(documentSource).toContain(primitive)
    }
  })

  it("does not introduce a separate print engine or call window.print directly", () => {
    expect(documentSource).not.toContain("window.print")
    expect(documentSource).not.toContain("printDocument(")
  })
})

describe("report card print document reads the frozen snapshot only", () => {
  it("renders values from the ReportCardSnapshotV2 alone", () => {
    expect(documentSource).toContain("snapshot.student")
    expect(documentSource).toContain("snapshot.class")
    expect(documentSource).toContain("snapshot.session")
    expect(documentSource).toContain("snapshot.subjects")
    expect(documentSource).toContain("snapshot.overall")
    expect(documentSource).toContain("snapshot.examResolutions")
  })

  it("reads no live reference data or API layer", () => {
    for (const live of [
      "useBranding",
      "useStudents",
      "useSubjects",
      "useClassesOptions",
      "useSections",
      "useAcademicSessions",
      "reportCardService",
      "apiClient",
    ]) {
      expect(documentSource, `document must not use ${live}`).not.toContain(live)
    }
    expect(documentSource).not.toMatch(/\bfetch\(/)
  })

  it("maps the frozen school identity into the shared letterhead override", () => {
    expect(documentSource).toContain("snapshot.school")
    expect(documentSource).toMatch(/identity=\{identity\}/)
  })
})

describe("report card print document prints frozen marks and signatories", () => {
  it("prints the frozen per-subject marks (obtained / maximum)", () => {
    expect(documentSource).toContain("subject.marks")
    expect(documentSource).toContain("obtainedMarks")
    expect(documentSource).toContain("maxMarks")
  })

  it("preserves the frozen marking status instead of assuming a score", () => {
    // A missing mark must be shown by its frozen status, never as zero.
    expect(documentSource).toContain("reportCardMarkStatusLabel")
    expect(documentSource).toContain('status === "SCORED"')
    expect(documentSource).not.toContain('?? "0"')
  })

  it("prints the frozen signatory names and roles", () => {
    expect(documentSource).toContain("snapshot.signatories")
    expect(documentSource).toContain("PrintSignatureRow")
  })

  it("keeps exam resolutions separate from marks", () => {
    expect(documentSource).toContain("Exam resolutions")
    expect(documentSource).toContain("replace the marks")
  })
})

describe("report card print document omits unsupported historical fields", () => {
  it("never prints a workflow date field or labels one as an issue date", () => {
    for (const field of ["issuedAt", "createdAt", "generatedAt"]) {
      expect(documentSource, `document must not read ${field}`).not.toContain(field)
    }
    // No printed "Issued" label: the v2 contract carries no issue date, and a
    // workflow timestamp must never be relabelled as one.
    expect(documentSource).not.toMatch(/label:\s*"Issued"/)
  })
})

describe("report card detail page wires the print surface", () => {
  it("mounts the document from a v2 snapshot only", () => {
    expect(pageSource).toContain("ReportCardPrintDocument")
    expect(pageSource).toContain("schemaVersion === 2")
    expect(pageSource).toContain("<ReportCardPrintDocument snapshot={snapshotV2} />")
  })

  it("disables printing for a legacy snapshot and explains why", () => {
    expect(pageSource).toContain("disabled={snapshotV2 === null}")
    expect(pageSource).toMatch(/complete official print is unavailable/i)
  })

  it("hides its screen chrome from print", () => {
    expect(pageSource).toContain("print:hidden")
  })
})

describe("shared PrintDocument identity override stays opt-in", () => {
  it("accepts a frozen identity and forwards it to the letterhead and footer", () => {
    expect(printDocumentSource).toContain("identity?: PrintLetterheadIdentity")
    expect(printDocumentSource).toMatch(/<PrintLetterhead identity=\{identity\}/)
    expect(printDocumentSource).toContain("schoolName={identity?.schoolName}")
  })

  it("keeps resolving live branding when no identity is supplied", () => {
    expect(printDocumentSource).toContain("const source = identity ?? data")
    expect(printDocumentSource).toContain(
      "schoolNameOverride ?? (data?.schoolName || branding.schoolName)",
    )
  })
})
