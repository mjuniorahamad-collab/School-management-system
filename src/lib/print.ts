// Browser-print seam.
//
// Every printable surface in the app goes through printDocument(). It is the only
// place window.print() is called, so page size, the document title and the
// orientation override are decided in exactly one spot.
//
// Deliberate limitations (see docs/print-architecture.md):
//   - Browser print only. No PDF generation, no /print routes, no print portals.
//   - The document title is set for the print/save dialog and the browser's
//     "Save as PDF" filename, then restored.
//   - There is no `*:print` permission. A print action is gated by the existing
//     read permission of the artifact it renders.

/** Page width is fixed to A4; portrait is the default orientation (decision D5). */
export const PRINT_PAGE_SIZE = "A4"

/** Margins in millimetres, matching the @page rule in src/index.css. */
export const PRINT_MARGIN_MM = 14
export const PRINT_MARGIN_MM_LANDSCAPE = 12

/**
 * Row count a full-dataset print may collect before it refuses. Printing is a
 * bounded walk over a paginated list API, not an unbounded fetch: 500 rows is
 * roughly 8-10 A4 pages, which is a sane ceiling for a browser print job.
 * Over this the request is refused explicitly rather than silently truncated
 * (decision D4).
 */
export const PRINT_MAX_ROWS = 500

/**
 * Page size used when walking a paginated list API for a full-dataset print.
 * Matches the `pageSize` maximum the list endpoints accept.
 */
export const PRINT_PAGE_SIZE_PARAM = 100

/** Class contract shared by components and the foundation test. */
export const PRINT_HIDDEN = "print:hidden"

/** A print-only region: invisible on screen, laid out by the print stylesheet. */
export const PRINT_ONLY = "hidden print:block"

/** The element PrintDocument renders as its own root. */
export const PRINT_DOCUMENT_CLASS = "print-document"

export type PrintOrientation = "portrait" | "landscape"

const ORIENTATION_STYLE_ID = "sms-print-orientation"

function pageRule(orientation: PrintOrientation): string {
  const size =
    orientation === "landscape" ? `${PRINT_PAGE_SIZE} landscape` : `${PRINT_PAGE_SIZE} portrait`
  const margin =
    orientation === "landscape" ? PRINT_MARGIN_MM_LANDSCAPE : PRINT_MARGIN_MM
  return `@page { size: ${size}; margin: ${margin}mm; }`
}

/**
 * Chromium does not honour named `@page` rules, so a landscape artifact needs a
 * real top-level @page rule in the document while it prints. It is injected just
 * before the print and removed afterwards, which keeps the on-screen document
 * (and every subsequent print) on the portrait default from index.css.
 */
function applyOrientation(orientation: PrintOrientation): void {
  if (typeof document === "undefined") return
  document.getElementById(ORIENTATION_STYLE_ID)?.remove()
  if (orientation === "portrait") return
  const style = document.createElement("style")
  style.id = ORIENTATION_STYLE_ID
  style.textContent = pageRule(orientation)
  document.head.appendChild(style)
}

function clearOrientation(): void {
  if (typeof document === "undefined") return
  document.getElementById(ORIENTATION_STYLE_ID)?.remove()
}

export interface PrintDocumentOptions {
  /** Printed as document.title, and used by the browser's save-as-PDF filename. */
  title?: string
  /** Wide artifacts (timetable, result sheet) pass "landscape". */
  orientation?: PrintOrientation
}

/**
 * Opens the browser print dialog for whatever the caller has mounted in a
 * PRINT_ONLY region. No-ops outside a browser so it is safe to call from tests
 * and from server-side rendering guards.
 */
export function printDocument(options: PrintDocumentOptions = {}): void {
  if (typeof window === "undefined" || typeof document === "undefined") return

  const { title, orientation = "portrait" } = options
  const previousTitle = document.title
  if (title !== undefined && title.trim() !== "") {
    document.title = title
  }

  applyOrientation(orientation)

  let restored = false
  const restore = () => {
    if (restored) return
    restored = true
    document.title = previousTitle
    clearOrientation()
    window.removeEventListener("afterprint", restore)
  }

  window.addEventListener("afterprint", restore)
  // Chromium fires afterprint reliably, but a user who dismisses the dialog with
  // Esc on some platforms does not always emit it; the timeout is a safety net so
  // the app title and page size can never be left overridden.
  window.setTimeout(restore, 60_000)

  try {
    window.print()
  } catch {
    restore()
  }
}

/** Exposed for the foundation test; the exact rule text a given orientation emits. */
export function printPageRuleForTest(orientation: PrintOrientation): string {
  return pageRule(orientation)
}
