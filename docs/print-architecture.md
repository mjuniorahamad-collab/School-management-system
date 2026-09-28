# Print architecture

Every printable artifact in this application is rendered by the browser from data
the user is already allowed to read. There is no PDF service, no print queue, no
report-card generator, and no stored "printed" copy of any record.

## Why no server-side PDF

The school needs paper copies of records it already displays. A server-side PDF
pipeline would introduce a second rendering stack, a font and template
deployment problem, an async job queue, and a second copy of the permission model
— in exchange for nothing the browser's own print pipeline does not already do.
Chromium and Edge (the supported targets) honour `@page`, `print-color-adjust`,
page breaks and the same typography the screen already uses.

The one capability this design deliberately does **not** have is byte-identical
output across browsers. That was accepted: only Chromium-based desktop browsers
are supported, and the stylesheet is the single source of truth for print layout.

## The two-layer contract

Every artifact is two layers, and they must never mix:

1. **The screen layer** — the existing interactive UI. Everything that is
   navigation, filtering, pagination or an action is marked `print:hidden`.
2. **The print document** — a `PrintDocument` rendered inside the same tree, with
   the class `hidden print:block`. It is invisible on screen and becomes the only
   thing on the page when printing.

```tsx
<SectionCard>
  <div className="print:hidden">{/* filter chips, pagination, buttons */}</div>
  <PrintDocument title="Library Circulation Register">
    <PrintTable columns={columns} rows={rows} rowKey={(row) => row.id} />
  </PrintDocument>
</SectionCard>
```

**Reports are the one exception.** A report's printed content *is* its screen
content: the report endpoint has already shaped the rows for display, and
duplicating them into a second print-only tree would create two renderings that
can disagree. `ReportPrintFrame` instead wraps the live body in
`class="print-document"` — a class defined only inside `@media print`, so it
changes nothing on screen — and adds a print-only letterhead, title block, scope
line and repeating footer around it. The same holds for the two grid artifacts
(Timetable, Result Sheet), which are grids rather than `PrintTable`s but are
still `PrintDocument`s.

Two details make this reliable and are both easy to get wrong:

- **Never use `<header>` for the letterhead.** The stylesheet hides bare `header`
  elements to drop the application's sticky page header, so a semantic `<header>`
  in an artifact would be hidden by the same rule. `PrintLetterhead` uses
  `<div data-print-letterhead>` instead. The same trap applies in reverse: a
  *screen* header that prints is a `<div>`, not a `<header>` — `PageHeader`
  therefore never gets caught by that rule, so pages that print must wrap it in
  `print:hidden` themselves.
- **Never move `print:hidden` to an ancestor of the print document.** Hiding the
  whole page also hides the artifact, and the report body hit exactly this bug.

## Building blocks

One focused module per primitive. They are small, dumb components that render the
values they are given; none of them fetches, aggregates or recomputes.

| Module | Export | Purpose |
| --- | --- | --- |
| `src/lib/print` | `printDocument({ title, orientation })` | The only `window.print()` call. Overrides `document.title`, restores it afterwards. |
| `src/components/print/PrintButton` | `PrintButton` | The standard action. Synchronous: it assumes the data is already loaded. |
| `src/components/print/PrintDocument` | `PrintDocument`, `PrintLetterhead`, `PrintTitleBlock`, `PrintFooter` | The shell: print-only region, identity block, title block, repeating footer. |
| `src/components/print/PrintFields` | `PrintFieldGrid`, `PrintSection` | Label/value grid (2, 3 or 4 columns) and a named block heading. |
| `src/components/print/PrintTable` | `PrintTable` | Column-configured table with widths, density, a repeating `tfoot` and an explicit empty state. |
| `src/components/print/PrintTotals` | `PrintTotals` | `strip` (a band of headline figures) or `ledger` (a right-aligned column, one row emphasised). |
| `src/components/print/PrintSignatures` | `PrintSignatureRow` | Signature rules; prints a server-supplied name above the rule rather than asking for it again. |
| `src/lib/format` | `formatAmountInWords` | Pure Indian lakh/crore rendering of an integer rupee figure, for a receipt. |

The primitives are a shared **visual language**, not a shared template. Each
artifact keeps the structure its content needs: a register is a wide table, a
schedule is a grid, a financial document is a totals block.

## Visual language

The type scale, the rules and the density live in `src/index.css` under
`@media print`. A document must not restate any of them:

- **Named type scale.** `.print-document-title`, `-school-name`, `-section`,
  `-label`, `-value`, `-note`, `-table`, `-table-compact`, and the `-total`
  family. Sizes are in `pt` so type tracks the A4 page rather than the 96 dpi
  screen the rule was authored against. A hand-written `text-[9pt]` is a defect.
- **One cell-border rule.** `.print-document th, td { border: 0.5pt solid #cbd5e1 }`
  and nowhere else. A document that adds `border-*` to a cell prints a visibly
  different weight from every other table.
- **The stylesheet owns header shading.** `thead` and `tfoot` backgrounds come
  from CSS, not from a `bg-muted/40` utility, which prints as a grey wash.
- **Framing is opt-in and enumerated.** `frame` draws an outer border, and is used
  only by the four short single-page artifacts: Fee Receipt, Fee Invoice, Exam
  Schedule, Student Profile. Long flowing registers, the Timetable, the Result
  Sheet and Reports are unframed — a border around a multi-page document reads as
  a broken rectangle, not a frame. `frame` defaults to `false`.
- **Repeating footer, no page number.** `.print-document-footer` is
  `position: fixed`, which Chromium re-renders at the foot of *every* physical
  page, so a six-page register carries the document's identity throughout;
  `.print-document` reserves matching bottom padding so the band cannot overlap
  content. There is deliberately **no "Page N of M"**: Chromium honours neither
  `@page` margin boxes nor a per-page counter, so the number cannot be produced
  honestly, and a fabricated or always-"1" page number on a legal document is
  worse than none. Artifacts with a real scope state it in their own note —
  "Result set page 1 of 3" for the server's pagination, explicitly not a paper
  page count.

### Branding on paper

`GET /branding` stays `requireAuth`-only and tenant-scoped. Its projection was
widened (additively) to carry the fields a letterhead needs: `schoolShortName`,
`contactPhone`, `contactEmail`, `addressLine1`, `addressLine2`, `city`, `state`,
`postalCode`, `country`. No new endpoint, permission or migration; no logo field;
the settings store is never dumped.

Two rules the print path must keep:

- **`null` is not "empty".** A `null` from the API means the tenant has genuinely
  not set a value and renders as absent. The build-time `src/config/branding.ts`
  is consulted **only** while the query is unresolved (`data === undefined`) and
  must never override an explicit `null` — `data?.tagline || branding.schoolTagline`
  printed the default school's tagline on every other tenant's receipt.
- **The monogram is derived, never invented.** Configured short identity
  (verbatim if it is a short single token) → initials of the significant words in
  the school name (so "Bright Future International School" reads **BF**) →
  `branding.schoolInitials`.


## Page geometry

A4, defined once in `src/index.css`:

- Portrait, 14 mm margins — the default.
- Landscape, 12 mm margins — requested by the Timetable and Result Sheet.

`@page` is a top-level at-rule, so one page geometry cannot be scoped to one
element. Landscape is therefore requested imperatively: `printDocument()` injects
a scoped `@page { size: A4 landscape }` override, prints, then removes it on
`afterprint` (with a timeout fallback, since `afterprint` is not universally
fired). Chromium ignores named page rules such as `@page landscape { … }`, which
is why the override is unconditional.

## Permission model

There are **no `*:print` permissions**, and none should be added. Printing is
reading: anyone who may view a record may print it, and anyone who may not see it
has no button and no route to reach the data. Each artifact therefore gates its
own action on the permission that already guards the data:

| Artifact | Permission |
| --- | --- |
| Fee Invoice | `fees:view` |
| Payment Receipt (from a payment) | `receipts:view` |
| Exam Schedule | `exams:view` |
| Student Profile | `students:view` |
| Attendance Register | `attendance:view` |
| Result Sheet | `results:view` |
| Timetable | `timetable:view` |
| Library Circulation Register | `library:view` |
| Transport Passenger List | `transport:view` |
| Report (any Reports V1 catalog report) | the report's own `reports:view` + scope check |

**Printing is not audit-logged.** Nothing about viewing a record is audit-logged
today, so printing does not create an inconsistent special case. If the school
ever needs proof of issue, that is a "duplicate document" business rule, not a
printing side effect.

## Full-list printing (Library and Transport)

The screen list is paginated at 20 rows. A printed register must not silently
contain only page 1, so Library Circulation and the Transport Route Passenger List
collect the **complete filtered set** on demand:

- Fetching starts only on click — browsing the list costs nothing extra.
- Page 1 is requested at `pageSize: 100` (the API maximum).
- More than `PRINT_MAX_ROWS` (500) filtered rows is a hard failure with a message
  naming the real count. The user is told to narrow the filter; the application
  never prints a partial register.
- The count printed is `pagination.total` — the server's number. The document also
  states every active filter and search term, so the sheet is self-describing.

`collectFullList()` in `src/lib/collectFullList.ts` is a pure function and owns all
of this: it fetches page 1, verifies the pagination metadata agrees with
`pageSize`, fetches the remaining pages concurrently, deduplicates by id, and
verifies the final count equals `pagination.total` before returning. It returns
rows, or `null` if anything is inconsistent — a partial register is never returned.
`useFullFilteredList()` wraps it for the two tabs that need it, collecting through
`queryClient.fetchQuery` with print-specific keys and `staleTime: 0` so the print
request can never be served a stale page.

## Artifacts that print a bounded scope, not the whole list

- **Attendance Register** prints persisted records only, never the mark form.
- **Student Profile** prints the loaded profile.
- **Result Sheet** prints the currently loaded page and states **"Result set page
  X of Y"** — the server's pagination for the result set, explicitly not a paper
  page count, so a printed page is never mistaken for the whole class.
- **Report** prints the currently loaded page, and the frame's scope line names
  the resolved DTO filters (class, section, subject, date range) plus the same
  "result set page" wording.

### Exam Schedule: known scope defect

`ExamSchedulePrintDocument` takes a **single exam** and prints that one exam's
rows, but this document previously claimed it "prints the session's exam
calendar". It does not, and neither the code nor the screen offers a calendar
view — the user reaches it by opening one exam. A framed, one-page artifact that
says "calendar" would over-promise and print as a bare fragment. The description
now states the real scope.

Printing the whole session calendar is a genuine feature, not a print fix: it
needs a screen-equivalent calendar view and a server query shape, so it is
deliberately out of scope here. The defect is recorded rather than papered over.

## Testing

Layout, page geometry and print CSS cannot be asserted in JSDOM — `@media print`
and `@page` are invisible to it. The suite is therefore split:

- **Behaviour** (`src/lib/print.test.ts`, `src/lib/formatAmountInWords.test.ts`,
  `src/components/print/print-document.test.tsx`,
  `src/components/print/print-primitives.test.tsx`,
  `src/components/fees/fee-print-documents.test.tsx`,
  `src/components/reports/report-print.test.tsx`,
  `src/lib/collectFullList.test.ts`) — print invocation, title override and
  restoration, orientation, component structure, permission gating, and every
  collector safety rule.
- **Source contract** (`server/tests/print-foundation.test.ts`,
  `server/tests/print-surfaces.test.ts`) — reads `src/index.css` and the
  component sources as text and asserts the geometry rules, the named type
  scale, the single cell-border rule, which artifacts are framed and which are
  not, the `hidden print:block` pairing, the `print:hidden` split, and that a
  report wraps the live body instead of a second copy of the rows. These live
  under `server/tests/` because the frontend tsconfig has no Node types, and the
  assertions are deliberately textual so a `print:hidden` typo cannot pass
  unnoticed.
- **Branding** (`server/tests/branding-projection.test.ts` DB-free,
  `server/tests/branding.integration.test.ts` opt-in) — the null/blank
  normalisation, the tenant isolation, and the `null`-vs-`undefined` rule above.

Neither suite can prove a printed page looks right. Before any release that
includes a new artifact, print it once in Chrome or Edge and check orientation,
page breaks, header repetition and that no screen chrome leaked onto the page.

## Known data gap

`SchoolSetting.feeCurrency` defaults to `"USD"`, but the financial artifacts
render with `formatINR`. The printed currency symbol and the tenant's configured
currency can therefore disagree, and the tenant has no way to change the
formatter from the UI. This is a real bug in the fee module, not a print-layer
one; it is reported rather than fixed here because choosing between a tenant
setting and a hard-coded INR is a business decision (see AGENTS.md §0), and
changing the formatter would alter the Invoice and Receipt that finance
already reconciles against.
