import { readFileSync } from "node:fs"
import path from "node:path"
import { transform as minifyCss } from "lightningcss"
import { describe, expect, it } from "vitest"

// Contract test for the print foundation in src/index.css.
//
// JSDOM cannot evaluate @media print and vitest stubs CSS imports, so no DOM
// suite can prove the print stylesheet still exists. Deleting or truncating that
// block silently regresses every printable surface at once — a near-blank page,
// dark chrome leaking onto paper, or a document clipped to one viewport. This
// suite reads the stylesheet as text and pins the rules the architecture depends
// on.
//
// It lives beside the other Node-environment suites because it needs `node:fs`;
// the browser tsconfig has no Node typings, and Vite's `?raw` import returns an
// empty string under vitest's default `css: false`.

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/index.css"), "utf8")

const printBlock = css.slice(css.indexOf("@media print {"))

/** Reads a source file as text, for the contracts that are only observable in source. */
const readSource = (relative: string) =>
  readFileSync(path.resolve(import.meta.dirname, "../..", relative), "utf8")

/**
 * The declaration block of the first rule at `selector`, or `""` when the selector
 * is absent. Deliberately non-throwing: a deleted rule must fail the assertions that
 * depend on it, not abort collection of the whole file.
 */
function ruleAt(block: string, selector: string): string {
  const start = block.indexOf(selector)
  if (start < 0) return ""
  return block.slice(start, block.indexOf("}", start) + 1)
}

/**
 * Every declaration block in `block` whose selector list contains `selector`, in
 * source order. The print block is flat (no nesting), so a brace-anchored scan is
 * exact. Needed because one selector can legitimately own several rules.
 */
function allRulesAt(block: string, selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return [...block.matchAll(new RegExp(`[^{}]*${escaped}[^{}]*\\{[^}]*\\}`, "g"))].map(
    (match) => match[0],
  )
}

/**
 * The block as the production CSS pipeline would emit it. Lightning CSS is what
 * writes the shipped bundle (it arrives with the Tailwind Vite plugin), so this is
 * the real transformer, not a stand-in for it.
 */
function minified(source: string): string {
  return minifyCss({
    filename: "print-block.css",
    code: Buffer.from(source),
    minify: true,
  }).code.toString()
}

describe("print foundation stylesheet", () => {
  it("declares an A4 portrait page box with margins", () => {
    expect(css).toContain("@page {")
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4\s+portrait/)
    expect(css).toMatch(/@page\s*\{[^}]*margin:\s*14mm/)
  })

  it("releases the app shell's height and scroll clipping", () => {
    // AppShell is `h-dvh overflow-hidden` and <main> is `overflow-y-auto`;
    // browsers clip print output to a scroll container's visible box.
    expect(printBlock).toMatch(/html,\s*\n?\s*body\s*\{/)
    expect(printBlock).toContain("height: auto !important")
    expect(printBlock).toContain("overflow: visible !important")
  })

  it("forces a white sheet", () => {
    expect(printBlock).toMatch(/background:\s*#fff\s*!important/)
  })

  it("overrides the dark palette so a dark session still prints legibly", () => {
    // `.dark` is set on <html>, so the override has to cover both selectors and
    // appear after the .dark definition in the cascade. Both indexes are absolute
    // positions in the stylesheet: the definition first, the print override last.
    const definition = css.indexOf(".dark {")
    const override = css.lastIndexOf(".dark {")
    expect(definition).toBeGreaterThan(-1)
    expect(override).toBeGreaterThan(definition)
    expect(printBlock).toContain("--background: #fff")
    expect(printBlock).toContain("--foreground: #000")
  })

  it("hides chrome that portals to <body> and cannot be reached from the shell", () => {
    for (const selector of [
      '[data-slot="dialog-overlay"]',
      '[data-slot="dialog-close"]',
      '[data-slot="dropdown-menu-content"]',
      '[data-slot="popover-content"]',
      '[data-slot="command-dialog"]',
      "[data-sonner-toaster]",
    ]) {
      expect(printBlock).toContain(selector)
    }
    expect(printBlock).toMatch(/nav\[aria-label="Main navigation"\]/)
  })

  it("un-fixes dialogs so their print document can lay out as a page", () => {
    const dialogRule = ruleAt(printBlock, '[data-slot="dialog-content"]')
    expect(dialogRule).toContain("position: static !important")
    expect(dialogRule).toContain("transform: none !important")
    expect(dialogRule).toContain("max-height: none !important")
    expect(dialogRule).toContain("overflow: visible !important")
  })

  it("preserves authored shading and table rules", () => {
    expect(printBlock).toContain("-webkit-print-color-adjust: exact")
    expect(printBlock).toContain("print-color-adjust: exact")
    expect(printBlock).toContain("display: table-header-group")
    expect(printBlock).toContain("break-inside: avoid")
  })

  it("never prints a URL from a link", () => {
    expect(printBlock).toMatch(/a\[href\]::after\s*\{\s*\n?\s*content:\s*none/)
  })

  it("does not hand-write Tailwind's print variants", () => {
    // Tailwind's JIT emits the `print:hidden` and `print:block` utilities from
    // the literal class strings in the source; duplicating them by hand would
    // fork the generated rules.
    expect(css).not.toContain(".print\\:hidden")
    expect(css).not.toContain(".print\\:block")
  })
})

describe("print type scale", () => {
  // One named scale, owned by the stylesheet. A component that hand-writes a text
  // size drifts from every other document and is invisible to review, so the scale
  // is pinned here by class name and value.
  const scale: [string, string][] = [
    ["print-document-title", "font-size: 15pt"],
    ["print-document-school-name", "font-size: 14pt"],
    ["print-document-subtitle", "font-size: 10pt"],
    ["print-document-tagline", "font-size: 10pt"],
    ["print-document-section", "font-size: 10pt"],
    ["print-document-eyebrow", "font-size: 8pt"],
    ["print-document-label", "font-size: 8.5pt"],
    ["print-document-note", "font-size: 8.5pt"],
    ["print-document-table", "font-size: 9.5pt"],
    ["print-document-table-compact", "font-size: 8.5pt"],
  ]

  for (const [className, declaration] of scale) {
    it(`defines .${className} with ${declaration}`, () => {
      const rule = printBlock.slice(printBlock.indexOf(`.print-document .${className} {`))
      expect(rule.slice(0, 200)).toContain(declaration)
    })
  }

  it("defines the base document body size once", () => {
    const rule = printBlock.slice(printBlock.indexOf(".print-document {"))
    expect(rule.slice(0, 200)).toContain("font-size: 10.5pt")
  })

  it("uses pt units throughout the scale so type tracks the A4 page, not the screen", () => {
    // A stray px in the print block would render differently on paper than on the
    // 96dpi screen the same rule was authored against.
    const typography = printBlock
      .split("\n")
      .filter((line) => /font-size:\s*\d/.test(line))
      .join("\n")
    expect(typography).not.toMatch(/font-size:\s*[\d.]+px/)
  })
})

describe("print document frame", () => {
  it("frames the document only through an opt-in class", () => {
    expect(printBlock).toContain(".print-document.print-document-frame")
    const rule = printBlock.slice(printBlock.indexOf(".print-document.print-document-frame {"))
    expect(rule.slice(0, 200)).toMatch(/border:\s*1px solid/)
  })

  it("is not applied to .print-document itself, so registers stay unframed", () => {
    const base = printBlock.slice(printBlock.indexOf(".print-document {"))
    expect(base.slice(0, 400)).not.toMatch(/border:\s*1px solid/)
  })
})

describe("print footer band", () => {
  it("is fixed so it repeats at the foot of every physical page", () => {
    const rule = printBlock.slice(printBlock.indexOf(".print-document .print-document-footer {"))
    expect(rule.slice(0, 300)).toContain("position: fixed")
    expect(rule.slice(0, 300)).toContain("bottom: 0")
  })

  it("reserves page-bottom space on the document so the band cannot overlap content", () => {
    // Without this, the fixed footer would print on top of the final table row.
    const base = printBlock.slice(printBlock.indexOf(".print-document {"))
    expect(base.slice(0, 300)).toMatch(/padding-bottom:\s*\d+mm/)
  })

  it("prints no page counter, because a browser print cannot know one honestly", () => {
    // Chromium supports neither @page margin boxes nor a per-page counter, so a
    // "Page N of M" here would be a fabricated constant on a legal document.
    const rule = printBlock.slice(printBlock.indexOf(".print-document .print-document-footer {"))
    expect(rule.slice(0, 400)).not.toMatch(/Page\s*\{/)
  })
})

describe("print table rules", () => {
  it("owns the cell border in the th/td rule alone", () => {
    // Two competing border systems was the defect this scale replaced: one from
    // the stylesheet and one from a document's own per-cell utility.
    const cellRule = printBlock.slice(printBlock.indexOf(".print-document th,"))
    expect(cellRule.slice(0, 200)).toMatch(/border:\s*[\d.]+pt solid #cbd5e1/)
  })

  it("does not let the header/footer cell rules re-declare a border", () => {
    for (const selector of [".print-document thead th", ".print-document tfoot td"]) {
      const rule = printBlock.slice(printBlock.indexOf(`${selector} {`))
      expect(rule.slice(0, 200), `${selector} must not add its own border`).not.toMatch(/border:/)
    }
  })

  it("shades the repeating header and the repeating footer", () => {
    expect(printBlock).toMatch(/\.print-document thead th\s*\{[^}]*background:/)
    expect(printBlock).toMatch(/\.print-document tfoot td\s*\{[^}]*background:/)
  })

  it("keeps rows unsplit and a totals block unbroken", () => {
    expect(printBlock).toMatch(/\.print-document tr\s*\{[^}]*break-inside:\s*avoid/)
    expect(printBlock).toMatch(/\.print-document \.print-document-totals\s*\{[^}]*break-inside:\s*avoid/)
  })
})

describe("print identity block", () => {
  it("renders a monogram box and rules the letterhead off from the page", () => {
    expect(printBlock).toMatch(/\.print-document \.print-document-monogram\s*\{/)
    const rule = printBlock.slice(printBlock.indexOf(".print-document .print-document-letterhead {"))
    expect(rule.slice(0, 300)).toMatch(/border-bottom:/)
  })

  it("gives the monogram a fixed box so the header does not reflow per tenant", () => {
    const rule = printBlock.slice(printBlock.indexOf(".print-document .print-document-monogram {"))
    expect(rule.slice(0, 300)).toMatch(/width:\s*\d+mm/)
    expect(rule.slice(0, 300)).toMatch(/height:\s*\d+mm/)
  })
})

/**
 * Two print documents (the weekly timetable and the result sheet) were each
 * rebuilding the grid by hand and hand-writing `text-[9pt]` plus a per-cell
 * `border border-foreground/15`. That is precisely the drift the scale exists to
 * remove: the font came from the utility class instead of the stylesheet, and the
 * rule printed at a different weight from every other table in the app. Neither
 * was visible in review, because both looked reasonable on screen.
 */
describe("print documents use the scale instead of hand-written units", () => {
  const documents = [
    "src/components/print/PrintDocument.tsx",
    "src/components/print/PrintFields.tsx",
    "src/components/print/PrintTable.tsx",
    "src/components/print/PrintTotals.tsx",
    "src/components/print/PrintSignatures.tsx",
    "src/components/receipts/ReceiptPrintDocument.tsx",
    "src/components/fees/InvoicePrintDocument.tsx",
    "src/components/attendance/AttendanceRegisterPrintDocument.tsx",
    "src/components/library/CirculationPrintDocument.tsx",
    "src/components/transport/RoutePassengerListPrintDocument.tsx",
    "src/components/timetable/TimetablePrintDocument.tsx",
    "src/components/examinations/ExamSchedulePrintDocument.tsx",
    "src/components/results/ResultSheetPrintDocument.tsx",
    "src/components/students/StudentProfilePrintDocument.tsx",
  ]

  it.each(documents)("hand-writes no font size in %s", (relative) => {
    expect(readSource(relative)).not.toMatch(/text-\[/)
  })

  it.each(documents)("hand-writes no cell border in %s", (relative) => {
    // `.print-document th, td` owns the rule. A `border-*` utility on a th or td
    // prints a visibly different weight from every other table.
    const contents = readSource(relative)
    expect(contents).not.toMatch(/<(th|td)[^>]*className="[^"]*border-/)
    expect(contents).not.toMatch(/<span className="[^"]*border-/)
  })

  it.each(documents)("hand-writes no table header shading in %s", (relative) => {
    // `thead { background }` is the stylesheet's; a `bg-muted/40` here is a
    // screen token that prints as a grey wash on paper.
    expect(readSource(relative)).not.toMatch(/<thead className="[^"]*bg-/)
  })
})

/**
 * Regression: DialogContent centres itself on screen with `-translate-x-1/2
 * -translate-y-1/2`, and Tailwind v4 implements those utilities with the
 * standalone `translate` property — NOT the `transform` shorthand. The print
 * rulesheet reset `transform` only, so on paper the dialog kept
 * `translate: -50% -50%`. Because the dialog box then carried `position: static`
 * at the full printable width, every print document mounted inside it was painted
 * half off the LEFT edge of the page and upward off the top; and because
 * `translate` establishes a containing block for `position: fixed` descendants it
 * also captured `.print-document-footer`, clipping the footer band. Four dialog
 * artifacts were affected identically (Fee Receipt from Payments and from
 * Receipts, Fee Invoice, Exam Schedule), which is what identified it as a
 * stylesheet fault rather than a receipt fault.
 *
 * Both properties are required, and neither is redundant: the animation layer
 * (`tw-animate-css` @keyframes enter/exit) animates the `transform` shorthand,
 * while the centring utilities emit `translate`. They are declared in separate
 * rules, which is load-bearing rather than stylistic — see the last two tests.
 */
describe("print dialog transform contract", () => {
  const dialogRules = allRulesAt(printBlock, '[data-slot="dialog-content"]')
  const dialogResets = dialogRules.join("\n")
  const dialogSource = readSource("src/components/ui/dialog.tsx")

  it("resets the transform shorthand the animation layer animates", () => {
    expect(dialogResets).toMatch(/transform:\s*none\s*!important/)
  })

  it("resets the standalone translate property Tailwind v4 actually emits", () => {
    // `none`, not a zero length: any other value is non-`none` and would keep
    // establishing a containing block for the fixed-position footer band.
    expect(dialogResets).toMatch(/translate:\s*none\s*!important/)
  })

  it("resets every individual transform property DialogContent actually uses", () => {
    // The durable guard. Tailwind v4 maps a `translate-*` / `scale-*` / `rotate-*`
    // utility to that standalone property, and any surviving one both offsets the
    // document and captures fixed-position descendants such as the footer band.
    // Re-adding one of these utilities to the dialog therefore fails here until the
    // print rulesheet neutralises it too, instead of silently re-clipping paper.
    const utilities: Array<[string, RegExp]> = [
      ["translate", /translate-[xy]-/],
      ["scale", /(^|[^-\w])scale-/],
      ["rotate", /(^|[^-\w])rotate-/],
    ]
    for (const [property, utility] of utilities) {
      if (!utility.test(dialogSource)) continue
      expect(dialogResets, `DialogContent uses a ${property} utility`).toContain(
        `${property}: none !important`,
      )
    }
  })

  it("is not vacuous: DialogContent really does centre itself with a translate utility", () => {
    expect(dialogSource).toMatch(/-translate-x-1\/2/)
    expect(dialogSource).toMatch(/-translate-y-1\/2/)
  })

  it("keeps the two resets in separate, non-adjacent rules", () => {
    // Lightning CSS folds `translate: none` into `transform: translate(0)` when a
    // single block declares both, and `transform: translate(0)` does not reset the
    // standalone property. It only folds ADJACENT same-selector rules, so the resets
    // have to stay apart with at least one other rule between them. Merge them and
    // the fix becomes a no-op in the shipped bundle while every source-level
    // assertion above still passes.
    const transformRule = dialogRules.find((rule) => /transform:\s*none/.test(rule))
    const translateRule = dialogRules.find((rule) => /translate:\s*none/.test(rule))
    expect(transformRule).toBeDefined()
    expect(translateRule).toBeDefined()
    expect(translateRule).not.toBe(transformRule)

    const transformAt = printBlock.indexOf("transform: none !important")
    const translateAt = printBlock.indexOf("translate: none !important")
    expect(translateAt).toBeGreaterThan(transformAt)
    expect(printBlock.slice(transformAt, translateAt)).toMatch(/\}\s*[^{}]+\{/)
  })

  it("survives the production CSS minifier that folds those two resets", () => {
    // The one guard that catches what source assertions structurally cannot: the
    // shipped bundle is Lightning CSS's output, not this file. Assert the emitted
    // rule still neutralises `translate` and was not rewritten into a `transform`
    // that leaves it live.
    const emitted = minified(printBlock)
    expect(emitted).toMatch(
      /\[data-slot=dialog-content\]\{[^}]*translate:\s*none\s*!important/,
    )
    expect(emitted).not.toMatch(
      /\[data-slot=dialog-content\]\{[^}]*transform:[^;}]*translate\(0/,
    )
  })
})

/**
 * A modal Dialog locks the page through react-remove-scroll-bar, which injects a
 * singleton <style> into <head> AT RUNTIME — i.e. after this stylesheet — setting
 * `body[data-scroll-locked] { overflow: hidden !important; position: relative
 * !important; margin-right: Npx !important; padding-* }`. Both rules are
 * !important, so a same-specificity rule here would lose to document order. The
 * `html` qualifier is what actually wins. Left locked, every dialog-hosted print
 * document printed from inside a clip container: one page fits and anything taller
 * is cut instead of paginating.
 */
describe("print scroll-lock release", () => {
  const lockRule = ruleAt(printBlock, "html body[data-scroll-locked]")

  it("targets the attribute Radix's scroll lock sets on <body>", () => {
    expect(printBlock).toMatch(/html\s+body\[data-scroll-locked\]\s*\{/)
  })

  it("out-specifies the injected rule instead of relying on source order", () => {
    // The injected stylesheet is appended to <head> at runtime, so it comes after
    // ours. Equal specificity would lose to it; `html body[...]` wins on specificity.
    expect(printBlock).toMatch(/^\s*html\s+body\[data-scroll-locked\]\s*\{/m)
  })

  it("un-clips the body so a dialog print document can paginate", () => {
    expect(lockRule).toContain("overflow: visible !important")
    expect(lockRule).toContain("position: static !important")
    expect(lockRule).toContain("margin: 0 !important")
    expect(lockRule).toContain("padding: 0 !important")
  })

  it("is print-only, so the on-screen scroll lock is untouched", () => {
    const start = printBlock.indexOf("html body[data-scroll-locked]")
    expect(start).toBeGreaterThan(printBlock.indexOf("@media print"))
    expect(css.slice(0, css.indexOf("@media print"))).not.toContain("data-scroll-locked")
  })
})

/**
 * The artifact is a plain block, so its width IS the printable width: A4 is
 * 210mm and the @page margin is 14mm a side, giving 182mm. Every one of the rules
 * below protects that number, because a printed document is clipped by the page
 * box rather than scrolled — the failure is invisible on screen and in JSDOM.
 */
describe("print document geometry", () => {
  const baseRule = ruleAt(printBlock, ".print-document {")
  const frameRule = ruleAt(printBlock, ".print-document.print-document-frame {")

  it("leaves the document width to the page box", () => {
    // A width or min-width here, or a border/padding under content-box sizing,
    // silently exceeds the printable width and clips the right edge.
    expect(baseRule).not.toMatch(/(^|[\s;])(min-|max-)?width\s*:/)
    expect(frameRule).not.toMatch(/(^|[\s;])(min-|max-)?width\s*:/)
  })

  it("never offsets the document box", () => {
    // A margin, transform, translate or position on the document root is what moved
    // a printed artifact off the page before. None may come back.
    expect(baseRule).not.toMatch(/(^|[\s;])(transform|translate|position|margin|inset)\s*:/)
  })

  it("never reverts the global border-box sizing", () => {
    // Preflight sets box-sizing: border-box on every element, so the frame's 1px
    // border and its 6mm padding sit INSIDE the printable width. Content-box would
    // add 12mm and clip the right edge.
    expect(printBlock).not.toMatch(/box-sizing\s*:\s*content-box/)
  })

  it("reserves the footer band's page-bottom space in millimetres, not pixels", () => {
    expect(baseRule).toMatch(/padding-bottom:\s*\d+mm/)
    expect(frameRule).toMatch(/padding:\s*[\d.]+mm\s+[\d.]+mm\s+[\d.]+mm/)
  })

  it("keeps the print seam's page margins in step with the stylesheet", () => {
    // @page is the single source of page geometry; PRINT_MARGIN_MM is what the
    // landscape override is composed from, so the two must not drift apart.
    const margin = css.match(/@page\s*\{[^}]*margin:\s*([\d.]+)mm/)?.[1]
    expect(margin).toBeDefined()
    expect(readSource("src/lib/print.ts")).toContain(`PRINT_MARGIN_MM = ${margin}`)
  })
})
