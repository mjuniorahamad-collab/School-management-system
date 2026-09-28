import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

// Structural guards for printable surfaces.
//
// `print:hidden` and the print stylesheet's `header { display: none }` rule are
// both global, so a single misplaced class or a semantically "correct" wrapper
// element silently produces a blank page. Neither is observable from a JSDOM
// suite, so these tests pin the source wiring that the printed output depends on.

const src = (relative: string) => readFileSync(path.resolve(import.meta.dirname, "../..", relative), "utf8")

/** The opening tag of the nearest element that starts before `marker`. */
function nearestOpeningTag(source: string, marker: string, tag: string): string {
  const markerIndex = source.indexOf(marker)
  expect(markerIndex, `expected to find ${marker} in the source`).toBeGreaterThan(-1)
  const start = source.lastIndexOf(`<${tag}`, markerIndex)
  expect(start, `expected to find a <${tag}> before ${marker}`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf(">", start) + 1)
}

/**
 * The JSX ancestors of `element` in a source file, parsed rather than matched with
 * a regex. Innermost first.
 *
 * These contracts are about TREE POSITION, which is precisely what a regex cannot
 * see. Scanning backwards, a wrapper that was already closed before the marker is
 * indistinguishable from an open one, and re-indenting a JSX block changes nothing
 * about the tree while changing every text heuristic. A `print:hidden` or `flex`
 * ancestor is therefore invisible to text matching until it has already broken a
 * printed page.
 */
function jsxAncestors(
  relative: string,
  element: string,
): Array<{ name: string; attributes: string }> {
  const source = src(relative)
  const file = ts.createSourceFile(relative, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found: ts.JsxSelfClosingElement | ts.JsxElement | undefined
  const visit = (node: ts.Node): void => {
    if (found !== undefined) return
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement
      if (opening.tagName.getText(file) === element) found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  expect(found, `expected to find <${element}> in ${relative}`).toBeDefined()

  const chain: Array<{ name: string; attributes: string }> = []
  for (let node: ts.Node | undefined = found?.parent; node; node = node.parent) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      chain.push({
        name: opening.tagName.getText(file),
        attributes: opening.attributes.properties.map((attribute) => attribute.getText(file)).join(" "),
      })
    } else if (ts.isJsxFragment(node)) {
      chain.push({ name: "<>", attributes: "" })
    }
  }
  return chain
}

describe("PrintDocument letterhead", () => {
  const printDocumentSource = src("src/components/print/PrintDocument.tsx")

  it("does not render the letterhead inside a <header> element", () => {
    // The print stylesheet hides every bare `header` to drop the app's sticky
    // page header. A semantic <header> letterhead would be caught by that rule
    // and disappear from the printed page.
    expect(printDocumentSource).toContain("data-print-letterhead")
    expect(printDocumentSource).not.toMatch(/<header[^>]*data-print-letterhead/)
  })

  it("marks the document region as print-only", () => {
    expect(printDocumentSource).toContain("PRINT_ONLY")
  })
})

describe("Reports surface", () => {
  const page = src("src/pages/reports/ReportsPage.tsx")

  it("keeps the report body out of print:hidden", () => {
    // Regression: the whole <section> used to carry `print:hidden`, so the
    // "Print" button printed a blank page while the action row hid itself.
    const section = nearestOpeningTag(page, "<ReportResult", "section")
    expect(section).not.toContain("print:hidden")
  })

  it("hides the report catalog from print", () => {
    expect(nearestOpeningTag(page, "<ReportsCatalog", "div")).toContain("print:hidden")
  })

  it("hides the filter panel from print", () => {
    expect(nearestOpeningTag(page, "<ReportFilterPanel", "div")).toContain("print:hidden")
  })

  it("hides the page header from print", () => {
    // The report body prints its own title and scope; a second heading above it
    // would print as stray chrome.
    expect(nearestOpeningTag(page, "<PageHeader", "div")).toContain("print:hidden")
  })

  it("hides the screen report title from print", () => {
    // ReportPrintFrame prints its own title block, so leaving this visible would
    // put two titles on the sheet — one styled, one not.
    expect(nearestOpeningTag(page, "<h2 className=\"text-base", "div")).toContain("print:hidden")
  })
})

/**
 * A report is the one artifact whose printed content IS the screen content, so it
 * has no separate print document to mount. Instead the body is wrapped in a frame
 * that adds the letterhead, title block, scope and repeating footer, and the print
 * stylesheet strips the dashboard chrome the body is built from.
 */
describe("Report print frame", () => {
  const frame = src("src/components/reports/ReportPrintFrame.tsx")
  const shared = src("src/components/reports/shared.tsx")

  it("lays the report body out as a page", () => {
    // `.print-document` is defined only inside @media print, so attaching it to a
    // screen-visible wrapper changes nothing on screen.
    expect(frame).toContain('className="print-document"')
  })

  it("supplies a print-only letterhead, title block and footer", () => {
    for (const part of ["PrintLetterhead", "PrintTitleBlock", "PrintFooter", "PRINT_ONLY"]) {
      expect(frame).toContain(part)
    }
  })

  it("renders the live report body rather than a second copy of the rows", () => {
    // Duplicating the rows would risk the print and the screen disagreeing.
    expect(frame).toContain("{children}")
    for (const view of [
      "StudentRosterView",
      "AdmissionsSummaryView",
      "AttendanceSummaryView",
      "AcademicPerformanceView",
      "FeeCollectionView",
      "PaymentRegisterView",
    ]) {
      expect(frame, `${view} must not be rendered by the print frame`).not.toContain(view)
    }
  })

  it("never wraps the report body in a PrintDocument, which is print-only", () => {
    // PrintDocument is `hidden print:block`; using it here would blank the report
    // on screen.
    expect(frame).not.toContain("PrintDocument }")
    expect(frame).not.toMatch(/<PrintDocument/)
  })

  it("states the result-set scope and never claims a paper page number", () => {
    expect(frame).toContain("Result set page")
    expect(frame).toContain("not the whole result set")
    expect(frame).not.toMatch(/Page \{page\} of \{totalPages\} of/)
  })

  it("tags the dashboard chrome it expects the print stylesheet to neutralise", () => {
    for (const hook of [
      "print-document-report-stats",
      "print-document-table-shell",
      "data-print-status",
    ]) {
      expect(shared).toContain(hook)
    }
  })

  it("has the print stylesheet rules that neutralise those hooks", () => {
    const css = src("src/index.css")
    for (const selector of [
      ".print-document .print-document-report-stats",
      ".print-document .print-document-table-shell",
      ".print-document [data-print-status]",
    ]) {
      expect(css).toContain(selector)
    }
  })
})

/**
 * Every page that renders a print document must hide its own screen header, or
 * the printed page carries the app's heading and any un-hidden header action
 * (e.g. "Copy Day") above the artifact.
 */
describe("Page header isolation", () => {
  const pages: Array<[string, string]> = [
    ["src/pages/timetable/TimetablePage.tsx", "<PageHeader"],
    ["src/pages/results/ResultsPage.tsx", "<PageHeader"],
    ["src/pages/reports/ReportsPage.tsx", "<PageHeader"],
    ["src/pages/attendance/AttendancePage.tsx", "<PageHeader"],
    ["src/pages/payments/PaymentsPage.tsx", "<PageHeader"],
    ["src/pages/receipts/ReceiptsPage.tsx", "<PageHeader"],
    ["src/pages/fees/FeesPage.tsx", "<PageHeader"],
    ["src/pages/examinations/ExaminationsPage.tsx", "<PageHeader"],
    ["src/pages/library/LibraryPage.tsx", "<PageHeader"],
    ["src/pages/transport/TransportPage.tsx", "<PageHeader"],
  ]

  it.each(pages)("hides the page header in %s", (relative) => {
    expect(nearestOpeningTag(src(relative), "<PageHeader", "div")).toContain("print:hidden")
  })

  it("hides the attendance tab switcher from print", () => {
    // The printed artifact is always the register, never a tab of the screen UI.
    const page = src("src/pages/attendance/AttendancePage.tsx")
    expect(nearestOpeningTag(page, '{ id: "marking"', "div")).toContain("print:hidden")
  })
})

/**
 * Library and Transport own their print action inside a tab rather than in a
 * dialog, so the tab strip is the page's own chrome. It used to print as a bare
 * "Catalogue | Circulation" row above the register, and the page heading printed
 * above it too: `PageHeader` renders a <div>, not a <header>, so the print
 * stylesheet's bare-`header` rule could not reach it.
 */
describe("Tab-strip print isolation", () => {
  const pages = [
    ["src/pages/library/LibraryPage.tsx", "<TabsList"],
    ["src/pages/transport/TransportPage.tsx", "<TabsList"],
  ]

  it.each(pages)("hides the tab strip in %s", (relative, marker) => {
    expect(nearestOpeningTag(src(relative), marker, "TabsList")).toContain("print:hidden")
  })

  it("leaves the tabbed print document itself printable", () => {
    // The document lives inside a TabsContent; hiding that would print a blank page.
    const library = src("src/pages/library/LibraryPage.tsx")
    expect(nearestOpeningTag(library, "<LoansTab", "TabsContent")).not.toContain("print:hidden")
  })
})

/**
 * A frame around a multi-page register reads as a broken rectangle: the rule runs
 * off the foot of page one and reappears nowhere. Only short, single-page documents
 * are framed.
 */
describe("Framing is reserved for short documents", () => {
  const unframed = [
    "src/components/attendance/AttendanceRegisterPrintDocument.tsx",
    "src/components/library/CirculationPrintDocument.tsx",
    "src/components/transport/RoutePassengerListPrintDocument.tsx",
    "src/components/timetable/TimetablePrintDocument.tsx",
    "src/components/results/ResultSheetPrintDocument.tsx",
  ]

  it.each(unframed)("does not frame %s", (relative) => {
    const source = src(relative)
    expect(source).toMatch(/<PrintDocument[\s\S]*?>/)
    const opening = source.slice(source.indexOf("<PrintDocument"), source.indexOf(">", source.indexOf("<PrintDocument")) + 1)
    expect(opening).not.toContain("frame")
  })

  // Short, single-page artifacts read as unfinished without a border. The frame is
  // a deliberate, enumerated choice — never a default inherited by new documents.
  const framed = [
    "src/components/receipts/ReceiptPrintDocument.tsx",
    "src/components/fees/InvoicePrintDocument.tsx",
    "src/components/examinations/ExamSchedulePrintDocument.tsx",
    "src/components/students/StudentProfilePrintDocument.tsx",
  ]

  it.each(framed)("frames %s", (relative) => {
    const source = src(relative)
    const opening = source.slice(source.indexOf("<PrintDocument"), source.indexOf(">", source.indexOf("<PrintDocument")) + 1)
    expect(opening).toMatch(/\bframe\b/)
  })
})

/**
 * Regression: "Print receipt" on the payments list printed the whole Payments page
 * (heading, search, filters, every row, the pagination indicator) instead of the
 * single receipt. Two causes had to be fixed together: the page chrome carried no
 * `print:hidden` at all, and the print dialog opened before the receipt document
 * had mounted.
 */
describe("Payments surface", () => {
  const page = src("src/pages/payments/PaymentsPage.tsx")

  it("hides the payment list and its filters from print", () => {
    // The print:hidden wrapper must open before the list, so the whole screen UI
    // (search, method/date filters, rows, pagination) is excluded from the sheet.
    expect(page).toMatch(/print:hidden[\s\S]*<PaymentsList/)
  })

  it("keeps the payment dialogs outside the print:hidden wrapper", () => {
    // The dialogs own the receipt print document, which must never have a
    // print:hidden ancestor.
    expect(nearestOpeningTag(page, "<PaymentDetailDialog", "div")).not.toContain("print:hidden")
  })
})

/**
 * Regression: the AppShell root is `flex h-dvh w-full overflow-hidden` and <main>
 * is `overflow-y-auto`. The print stylesheet reset only reached `html, body`, so in
 * paged media the shell still reserved exactly one page box (h-dvh resolves against
 * the page height) and still clipped everything inside main. Every dialog print
 * document is a Radix portal — a <body> sibling of #root — so it began one full
 * page late: a blank page 1, with the receipt starting at its bottom edge and the
 * rest spilling to page 2.
 */
describe("Print stylesheet shell neutralisation", () => {
  const css = src("src/index.css")
  const shell = src("src/components/layout/AppShell.tsx")

  /** The declaration block of the first rule starting at `selector`. */
  function cssRule(selector: string): string {
    const start = css.indexOf(selector)
    expect(start, `expected to find ${selector} in src/index.css`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf("}", start) + 1)
  }

  it("tags the AppShell root so the ruleset has a stable hook", () => {
    expect(shell).toMatch(/<div data-print-shell className="[^"]*h-dvh[^"]*overflow-hidden"/)
  })

  it("resets the shell and its main scroll container in print", () => {
    const rule = cssRule("[data-print-shell],")
    expect(rule).toContain("[data-print-shell] main")
    expect(rule).toContain("height: auto !important")
    expect(rule).toContain("max-height: none !important")
    expect(rule).toContain("overflow: visible !important")
  })

  it("keeps the shell rule inside the print media query", () => {
    expect(css.indexOf("@media print")).toBeLessThan(css.indexOf("[data-print-shell],"))
  })

  it("un-grids the dialog in print so the document is sized by the page box", () => {
    // DialogContent is `grid gap-4` for screen. Left as a grid in print, the print
    // document became a grid item sized by the grid and carried the 1rem row gap.
    const rule = cssRule('[data-slot="dialog-content"]')
    expect(rule).toContain("display: block !important")
    expect(rule).toContain("gap: 0 !important")
  })
})

describe("Payment detail dialog print isolation", () => {
  const dialog = src("src/components/payments/PaymentDetailDialog.tsx")
  const content = dialog.slice(
    dialog.indexOf("function PaymentContent"),
    dialog.indexOf("function MetaCard"),
  )

  it("hides the dialog header from print", () => {
    expect(dialog).toMatch(/<DialogHeader[^>]*print:hidden/)
  })

  it("hides the dialog's screen content from print", () => {
    expect(content).toMatch(/<div className="flex flex-col gap-4 print:hidden">/)
  })

  it("mounts the receipt document as a direct child of DialogContent", () => {
    // Regression: the document used to be owned by PaymentContent, four levels deep
    // inside a SectionCard in a `flex flex-wrap` row. As a flex item it was sized by
    // its own content (max-content base, min-content floor) instead of by the page
    // box, so it rendered narrower than the sheet, wrapped, and grew tall enough to
    // cross a page break. It must sit beside the screen content, as a sibling.
    const document = dialog.indexOf("<ReceiptPrintDocument")
    expect(document).toBeGreaterThan(-1)
    expect(document).toBeLessThan(dialog.indexOf("function PaymentContent"))
    expect(dialog.lastIndexOf("</DialogContent>")).toBeGreaterThan(document)
  })

  it("guards the document against a receipt loaded for another payment", () => {
    // The dialog is not remounted between payments, so the loaded receipt must be
    // matched against the payment on screen or a stale document reaches the sheet.
    expect(dialog).toContain("printReceipt.id === data?.receipt?.id")
  })

  it("keeps the print trigger in the receipt row and hands the receipt upward", () => {
    expect(content).toMatch(/<PaymentReceiptPrint\s+receiptId=\{payment\.receipt\.id\}\s+onLoaded=\{onReceiptLoaded\}\s*\/>/)
  })

  it("leaves no document or card-chrome override inside the screen content", () => {
    // The whole screen block is print:hidden now, so the card needs no neutralised
    // chrome, and the document must not be duplicated inside it.
    expect(content).not.toContain("ReceiptPrintDocument")
    expect(content).not.toMatch(/print:border-0|print:bg-transparent|print:ring-0/)
  })
})

describe("Dialog screen-content isolation", () => {
  // Regression: these two dialogs only hid their button row, so printing from them
  // emitted the screen cards above the document on the same sheet.
  const dialogs: Array<[string, string, string]> = [
    ["src/components/receipts/ReceiptDetailDialog.tsx", "function ReceiptContent", "function Detail"],
    ["src/components/fees/InvoiceDetailDialog.tsx", "function InvoiceContent", "function MetaCard"],
  ]

  it.each(dialogs)("hides the header of %s from print", (relative) => {
    expect(src(relative)).toMatch(/<DialogHeader className="print:hidden">/)
  })

  it.each(dialogs)("hides the pending and error states of %s from print", (relative) => {
    const source = src(relative)
    expect(source).toMatch(/className="flex flex-col gap-3 print:hidden"/)
    expect(source).toMatch(/text-center print:hidden"/)
  })

  it.each(dialogs)("hides the screen content of %s from print", (relative, start, end) => {
    const source = src(relative)
    const content = source.slice(source.indexOf(start), source.indexOf(end))
    expect(content).toMatch(/<div className="flex flex-col gap-4 print:hidden">/)
  })
})

/**
 * Regression: PaymentReceiptPrint called printDocument() from the mutation's
 * `onSuccess`, so `window.print()` ran while the component was still rendering
 * `receipt.data === undefined` and the receipt document was not in the DOM. The
 * browser therefore snapshotted the surrounding page. Printing must be deferred to
 * an effect that runs after the document has committed.
 */
describe("PaymentReceiptPrint print ordering", () => {
  const source = src("src/components/payments/PaymentReceiptPrint.tsx")

  it("does not print from the mutation onSuccess callback", () => {
    expect(source).not.toMatch(/onSuccess\s*:\s*\([^)]*\)\s*=>\s*printDocument\(/)
  })

  it("schedules the print from an effect after the receipt loads", () => {
    expect(source).toMatch(/useEffect\([\s\S]*?requestAnimationFrame\([\s\S]*?printDocument\(/)
  })

  it("hands the receipt to the caller before the print frame is scheduled", () => {
    // The caller commits the document from onLoaded; React flushes that state
    // update in a microtask, so the frame runs only once the document is mounted.
    expect(source).toMatch(/onLoadedRef\.current\(data\)[\s\S]*?requestAnimationFrame\(/)
  })

  it("does not re-run the print effect when the callback identity changes", () => {
    // onLoaded writes state in the parent, so depending on it would re-notify,
    // re-render and reopen the print dialog in a loop. It is held in a ref and the
    // effect depends on the loaded receipt alone.
    expect(source).toMatch(/\}, \[receipt\.data\]\)/)
  })

  it("cancels the scheduled frame on cleanup", () => {
    expect(source).toContain("cancelAnimationFrame")
  })

  it("renders the trigger only, never the document itself", () => {
    // The document belongs to the dialog, as a direct DialogContent child.
    expect(source).not.toContain("ReceiptPrintDocument")
  })

  it("keeps the failure toast and the lazy fetch", () => {
    expect(source).toContain("onError: () => toast.error(")
    expect(source).toContain("onClick={() => receipt.mutate(receiptId)}")
  })
})

/**
 * Every artifact printed from inside a Radix dialog is laid out by the
 * `[data-slot="dialog-content"]` print rulesheet, so the document's position in
 * that tree is load-bearing, not cosmetic.
 *
 * It must sit directly under DialogContent:
 *   - a `print:hidden` ancestor hides the artifact and prints a blank page;
 *   - a `flex` / `grid` / card ancestor makes the document a flex or grid item, so
 *     it is sized by its own content instead of by the page box and no longer
 *     fills the printable width.
 *
 * This is the wiring that put the Fee Receipt half off the left edge of the sheet
 * once the dialog's `translate` was left live: the artifact was correct, its
 * container was not.
 */
describe("Dialog-hosted print surfaces", () => {
  const surfaces: Array<[relative: string, document: string]> = [
    ["src/components/payments/PaymentDetailDialog.tsx", "ReceiptPrintDocument"],
    ["src/components/receipts/ReceiptDetailDialog.tsx", "ReceiptPrintDocument"],
    ["src/components/fees/InvoiceDetailDialog.tsx", "InvoicePrintDocument"],
    ["src/components/examinations/ExaminationDetailDialog.tsx", "ExamSchedulePrintDocument"],
  ]

  it.each(surfaces)("mounts %s's document as a direct child of DialogContent", (relative, document) => {
    expect(jsxAncestors(relative, document)[0]?.name).toBe("DialogContent")
  })

  it.each(surfaces)("gives %s's document no print:hidden ancestor", (relative, document) => {
    for (const ancestor of jsxAncestors(relative, document)) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toContain("print:hidden")
    }
  })

  it.each(surfaces)("gives %s's document no flex, grid or card wrapper", (relative, document) => {
    // A flex/grid ancestor sizes the document by its own content; a card or panel
    // brings padding, a border and a background onto the sheet.
    for (const ancestor of jsxAncestors(relative, document)) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toMatch(
        /\b(flex|grid|rounded-|bg-|ring-|p-\d|shadow)/,
      )
    }
  })

  it.each(surfaces)("hides %s's screen chrome from print", (relative) => {
    expect(src(relative)).toContain("print:hidden")
  })
})

/**
 * A dialog-hosted print document is a Radix portal — a <body> sibling that comes
 * AFTER #root — so anything left un-hidden inside #root is laid out and paginated
 * first. Hiding only the dialog's own chrome is therefore not enough: the page
 * that OPENS the dialog must hide its own screen content too.
 *
 * Regression: "Print receipt" on the receipts list printed the whole Receipts page
 * (heading, search, date range, all 50 rows) across two pages and then pushed the
 * receipt onto page 3, because `ReceiptsPage` had no `print:hidden` anywhere. The
 * Payments fix had never been applied there, nor to Fees or Examinations.
 */
describe("Print-hosting page screen isolation", () => {
  const surfaces: Array<[page: string, list: string, dialog: string]> = [
    ["src/pages/receipts/ReceiptsPage.tsx", "<ReceiptsList", "<ReceiptDetailDialog"],
    ["src/components/fees/FeeInvoicesTab.tsx", "<InvoicesList", "<InvoiceDetailDialog"],
    ["src/pages/examinations/ExaminationsPage.tsx", "<ExaminationTable", "<ExaminationDetailDialog"],
  ]

  it.each(surfaces)("hides the screen list and its filters in %s", (relative, list) => {
    // The print:hidden wrapper must OPEN before the list, so the heading, search,
    // filters and every row are excluded from the sheet.
    expect(src(relative)).toMatch(new RegExp(`print:hidden[\\s\\S]*${list.replace(/[<]/g, "<")}`))
  })

  it.each(surfaces)("keeps the print-owning dialog outside the wrapper in %s", (relative, _list, dialog) => {
    // The document inside the dialog must have no print:hidden ancestor.
    for (const ancestor of jsxAncestors(relative, dialog.slice(1))) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toContain("print:hidden")
    }
  })

  it("hides the fees tab strip but leaves the tab bodies printable", () => {
    // Hiding <Tabs> itself would hide FeeInvoicesTab — and with it the invoice
    // document's own page — so only the strip is hidden. Text matching cannot tell
    // a closed wrapper from an open one, so the tree is parsed.
    const page = src("src/pages/fees/FeesPage.tsx")
    expect(nearestOpeningTag(page, "<TabsList", "div")).toContain("print:hidden")
    for (const ancestor of jsxAncestors("src/pages/fees/FeesPage.tsx", "TabsContent")) {
      expect(ancestor.attributes, `<${ancestor.name}> in FeesPage`).not.toContain("print:hidden")
    }
  })

  it("keeps the examinations form and confirm dialogs outside the wrapper", () => {
    for (const dialog of ["ExaminationFormDialog", "ConfirmDialog"]) {
      for (const ancestor of jsxAncestors("src/pages/examinations/ExaminationsPage.tsx", dialog)) {
        expect(ancestor.attributes, `<${ancestor.name}> in ExaminationsPage`).not.toContain("print:hidden")
      }
    }
  })
})

/**
 * Library and Transport mount their print document INLINE, above the on-screen
 * list rather than in a dialog, so their screen chrome cannot be hidden by
 * wrapping the page: the wrapper would become the document's own ancestor. The
 * screen rows have to be hidden in place, leaving the document a bare child of the
 * tab root.
 *
 * Regression: the search row, "Issue a book" / "Assign Student", the filter chips
 * and Selects, the 20-row list and the pagination all printed — before the register
 * in the first case and after it in the second, adding a stray page either way.
 */
describe("Inline print-document screen isolation", () => {
  const tabs: Array<[relative: string, document: string, list: string]> = [
    ["src/components/library/LoansTab.tsx", "CirculationPrintDocument", "<LoansList"],
    ["src/components/transport/AssignmentsTab.tsx", "RoutePassengerListPrintDocument", "<AssignmentsList"],
  ]

  it.each(tabs)("hides the screen list and filters in %s", (relative, _document, list) => {
    expect(src(relative)).toMatch(new RegExp(`print:hidden[\\s\\S]*${list.replace(/[<]/g, "<")}`))
  })

  it.each(tabs)("gives %s's print document no print:hidden ancestor", (relative, document) => {
    for (const ancestor of jsxAncestors(relative, document)) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toContain("print:hidden")
    }
  })

  it.each(tabs)("keeps %s's print document free of card chrome", (relative, document) => {
    // The tab root is a `flex flex-col` block container, which is fine, but a card
    // or panel wrapper would put a border, background and padding on the sheet.
    for (const ancestor of jsxAncestors(relative, document)) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toMatch(
        /\b(rounded-|bg-|ring-|shadow|p-\d)/,
      )
    }
  })
})

/**
 * Regression: the results page left two screen-only blocks printable. The exam
 * metadata card duplicates the metadata the result sheet already prints in its own
 * header, and the trailing footnote is screen help text. Both printed on the sheet.
 */
describe("Results surface isolation", () => {
  const page = src("src/pages/results/ResultsPage.tsx")

  it("hides the exam metadata card, which the sheet prints itself", () => {
    expect(nearestOpeningTag(page, "<MetaCard label=\"Examination\"", "div")).toContain("print:hidden")
  })

  it("hides the trailing absences footnote", () => {
    expect(page).toMatch(/<p className="text-xs text-muted-foreground print:hidden">/)
  })

  it("still hides the interactive marks grid", () => {
    expect(nearestOpeningTag(page, "<ResultSheetGrid", "div")).toContain("print:hidden")
  })

  it("leaves the result sheet printable", () => {
    for (const ancestor of jsxAncestors("src/pages/results/ResultsPage.tsx", "ResultSheetPrintDocument")) {
      expect(ancestor.attributes).not.toContain("print:hidden")
    }
  })
})

/**
 * Regression: Library and Transport called `printDocument()` in the same tick as
 * `setPrintRows()`, so `window.print()` ran before React had committed the
 * collected rows and the register was absent from the snapshot. Printing must be
 * deferred to an effect keyed on the rows, scheduled in an animation frame — the
 * same guarantee `PaymentReceiptPrint` relies on.
 */
describe("Collected-register print ordering", () => {
  const tabs: Array<[relative: string, document: string]> = [
    ["src/components/library/LoansTab.tsx", "CirculationPrintDocument"],
    ["src/components/transport/AssignmentsTab.tsx", "RoutePassengerListPrintDocument"],
  ]

  it.each(tabs)("schedules the print from an effect after the rows land in %s", (relative) => {
    expect(src(relative)).toMatch(/useEffect\([\s\S]*?requestAnimationFrame\([\s\S]*?printDocument\(/)
  })

  it.each(tabs)("cancels the scheduled frame on cleanup in %s", (relative) => {
    expect(src(relative)).toContain("cancelAnimationFrame")
  })

  it.each(tabs)("keys the print effect on the collected rows in %s", (relative) => {
    expect(src(relative)).toMatch(/\}, \[printRows\]\)/)
  })

  it.each(tabs)("never prints straight from handlePrint in %s", (relative) => {
    // The failure mode itself: rows assigned and window.print() called in the same
    // statement sequence, with no commit in between.
    expect(src(relative)).not.toMatch(/setPrintRows\([^)]*\)\s*\n\s*setPrintTotal\([^)]*\)\s*\n\s*printDocument\(/)
  })

  it.each(tabs)("still refuses to print when the list could not be proven complete in %s", (relative) => {
    // The 500-row cap and total reconciliation in collectFullList are the reason a
    // register is either complete or absent; the early return must survive.
    const source = src(relative)
    expect(source).toMatch(/const rows = await collect\(\)\s*\n\s*if \(rows === null\) return/)
    expect(source).toContain("PRINT_PAGE_SIZE_PARAM")
  })

  it.each(tabs)("mounts %s's document only once rows were collected", (relative, document) => {
    // The document is gated on the collected rows, so browsing the tab fetches and
    // renders nothing for printing.
    expect(src(relative)).toMatch(new RegExp(`\\{printRows && \\(\\s*<${document}`))
  })
})

/**
 * Every print document — dialog-hosted or page-hosted — must be free of a
 * `print:hidden` ancestor. Dialog-hosted documents are covered above; this covers
 * the page-hosted ones, which is where a wrapper added to tidy up screen chrome
 * would most easily swallow the artifact.
 */
describe("Page-hosted print surfaces", () => {
  const surfaces: Array<[relative: string, document: string]> = [
    ["src/pages/attendance/AttendancePage.tsx", "AttendanceRegisterPrintDocument"],
    ["src/pages/timetable/TimetablePage.tsx", "TimetablePrintDocument"],
    ["src/pages/students/StudentDetailPage.tsx", "StudentProfilePrintDocument"],
    ["src/pages/results/ResultsPage.tsx", "ResultSheetPrintDocument"],
    ["src/components/library/LoansTab.tsx", "CirculationPrintDocument"],
    ["src/components/transport/AssignmentsTab.tsx", "RoutePassengerListPrintDocument"],
  ]

  it.each(surfaces)("gives %s's document no print:hidden ancestor", (relative, document) => {
    for (const ancestor of jsxAncestors(relative, document)) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toContain("print:hidden")
    }
  })

  it.each(surfaces)("keeps %s's document free of card chrome", (relative, document) => {
    for (const ancestor of jsxAncestors(relative, document)) {
      expect(ancestor.attributes, `<${ancestor.name}> in ${relative}`).not.toMatch(
        /\b(rounded-|bg-|ring-|shadow|p-\d)/,
      )
    }
  })
})

/**
 * The regression this whole file exists for was possible because the contracts
 * above enumerated a hand-picked subset of surfaces: Receipts, Fees and
 * Examinations were never listed, so nothing failed when they leaked.
 *
 * This block closes the hole. It discovers every file that actually MOUNTS a print
 * document or the report print frame, and requires that set to match the declared
 * list exactly. A new print surface therefore cannot be added without also adding
 * its containment contracts, and a surface cannot be quietly dropped from them.
 */
describe("Every print surface is covered by a contract", () => {
  const srcRoot = path.resolve(import.meta.dirname, "../..", "src")

  const declared = [
    "components/examinations/ExaminationDetailDialog.tsx",
    "components/fees/InvoiceDetailDialog.tsx",
    "components/library/LoansTab.tsx",
    "components/payments/PaymentDetailDialog.tsx",
    "components/receipts/ReceiptDetailDialog.tsx",
    "components/reports/ReportResult.tsx",
    "components/transport/AssignmentsTab.tsx",
    "pages/attendance/AttendancePage.tsx",
    "pages/results/ResultsPage.tsx",
    "pages/students/StudentDetailPage.tsx",
    "pages/timetable/TimetablePage.tsx",
  ]

  it("finds exactly the declared set of print-document hosts", () => {
    const files = readdirSync(srcRoot, { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx") && !entry.includes(".test."))
      .map((entry) => entry.split(path.sep).join("/"))
      .filter((entry) => {
        const source = readFileSync(path.join(srcRoot, entry), "utf8")
        // `<\w+PrintDocument` deliberately excludes the generic <PrintDocument>
        // used inside each document's own implementation, so only hosts match.
        return /<\w+PrintDocument\b/.test(source) || /<ReportPrintFrame\b/.test(source)
      })
      .sort()

    expect(files, "a print surface was added or removed without updating its contracts").toEqual(
      declared,
    )
  })

  it("gives every declared surface a no-print:hidden-ancestor contract", () => {
    // The sweep above plus the Dialog-hosted / Page-hosted / Inline blocks is only
    // meaningful if the declared list cannot drift away from those blocks.
    const guarded = new Set<string>()
    for (const relative of [
      "src/components/payments/PaymentDetailDialog.tsx",
      "src/components/receipts/ReceiptDetailDialog.tsx",
      "src/components/fees/InvoiceDetailDialog.tsx",
      "src/components/examinations/ExaminationDetailDialog.tsx",
      "src/pages/attendance/AttendancePage.tsx",
      "src/pages/timetable/TimetablePage.tsx",
      "src/pages/students/StudentDetailPage.tsx",
      "src/pages/results/ResultsPage.tsx",
      "src/components/library/LoansTab.tsx",
      "src/components/transport/AssignmentsTab.tsx",
    ]) {
      guarded.add(relative.replace("src/", ""))
    }
    // ReportResult is covered by the Reports-surface block above instead, which
    // asserts the report body keeps no print:hidden wrapper.
    expect([...guarded].sort()).toEqual(declared.filter((entry) => !entry.startsWith("components/reports/")))
  })
})
