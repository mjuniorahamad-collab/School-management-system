import type { ReactNode } from "react"
import { branding } from "@/config/branding"
import { useBranding } from "@/hooks/useBranding"
import { PRINT_DOCUMENT_CLASS, PRINT_ONLY } from "@/lib/print"
import type { BrandingResponse } from "@/types/settings"

/**
 * A frozen school identity a document may render instead of live tenant branding.
 *
 * A historical artifact (e.g. an issued report card) must print the school
 * identity that was true when it was frozen, not the tenant's current name and
 * contact details. This is the same shape the live `/branding` projection returns,
 * so a frozen snapshot can supply it directly. It is opt-in and per-document: with
 * no override, the shell keeps resolving the live tenant branding exactly as before.
 */
export type PrintLetterheadIdentity = BrandingResponse

/**
 * The shell every printable surface renders.
 *
 * A `PrintDocument` is a PRINT_ONLY region (absent from the screen, laid out by the
 * print stylesheet) holding a letterhead, a title block, the artifact's own
 * fields/tables, and a repeating footer.
 *
 * The shell is deliberately dumb: it renders the values it is given. No document
 * recomputes money, totals, percentages or statuses — every value printed is a
 * field of the already-authorized server DTO, so a printed document can never
 * disagree with the screen it came from.
 *
 * It provides a shared VISUAL LANGUAGE (identity, hierarchy, type scale, rules),
 * not a shared TEMPLATE. Each artifact keeps the structure its content actually
 * needs: a register is a wide table, a schedule is a grid, a financial document is
 * a totals block. Nothing here decides an artifact's layout.
 */

/**
 * Words that carry no identity in a school's name, so the derived monogram is not
 * dominated by them. "Bright Future International School" must read "BF", not
 * "BFI" or "BFIS".
 */
const MONOGRAM_STOPWORDS = new Set([
  "the",
  "and",
  "of",
  "for",
  "a",
  "an",
  "international",
  "school",
  "academy",
  "college",
  "institute",
  "institution",
  "public",
  "private",
  "senior",
  "primary",
])

/**
 * Derives a deterministic monogram from an explicitly-configured short identity
 * or from the school name. No new branding source is introduced: it only reads
 * values the server already returns. A short single-token identity ("PSA", "BFIS")
 * is taken verbatim because it is already an acronym; anything else falls back to
 * initials of the significant words.
 */
function deriveMonogram(shortName: string | null, schoolName: string): string {
  const from = (source: string): string | null => {
    const tokens = source.split(/[^A-Za-z0-9]+/).filter((token) => token !== "")
    if (tokens.length === 0) return null
    const compact = tokens.join("")
    if (tokens.length === 1 && compact.length >= 2 && compact.length <= 4) {
      return compact.toUpperCase()
    }
    const significant = tokens.filter(
      (token) => token.length > 1 && !MONOGRAM_STOPWORDS.has(token.toLowerCase()),
    )
    const initials = (significant.length > 0 ? significant : tokens)
      .slice(0, 3)
      .map((token) => token.charAt(0).toUpperCase())
      .join("")
    return initials === "" ? null : initials
  }

  return from(shortName ?? "") ?? from(schoolName) ?? branding.schoolInitials
}

export interface PrintDocumentProps {
  /** Artifact name, e.g. "Fee Receipt". */
  title: string
  /** Optional small-caps kicker above the title, e.g. "FEE RECEIPT". */
  eyebrow?: string
  /** Optional line under the title: a filter scope, a date range, a status. */
  subtitle?: string
  /** Free-form scope/identity block rendered under the title block. */
  meta?: ReactNode
  /** Optional footer note, e.g. a completeness statement. */
  note?: ReactNode
  /**
   * Draws the artifact's outer document border. Intended for short, single-page
   * documents (receipts, invoices, schedules) that look unfinished without one.
   * Long flowing registers must NOT set it: a border around a multi-page document
   * reads as a broken rectangle rather than a frame.
   */
  frame?: boolean
  /** Marks the document so the print stylesheet can lay it out. */
  className?: string
  /**
   * A FROZEN school identity to print instead of live tenant branding. Opt-in: an
   * absent value keeps the default live-branding letterhead and footer. A historical
   * artifact (e.g. an issued report card) passes its frozen `snapshot.school` so the
   * letterhead/footer never read the tenant's current, mutable name.
   */
  identity?: PrintLetterheadIdentity
  children: ReactNode
}

export function PrintDocument({
  title,
  eyebrow,
  subtitle,
  meta,
  note,
  frame = false,
  className,
  identity,
  children,
}: PrintDocumentProps) {
  return (
    <div
      className={`${PRINT_ONLY} ${PRINT_DOCUMENT_CLASS} ${frame === true ? "print-document-frame" : ""} ${className ?? ""}`.trim()}
    >
      <PrintLetterhead identity={identity} />
      <div className="mt-4">
        <PrintTitleBlock title={title} eyebrow={eyebrow} subtitle={subtitle} />
      </div>
      {meta !== undefined && <div className="mt-3">{meta}</div>}
      <div className="mt-4">{children}</div>
      {note !== undefined && note !== "" && (
        <p className="print-document-note mt-4 text-justify">{note}</p>
      )}
      <PrintFooter documentTitle={title} schoolName={identity?.schoolName} />
    </div>
  )
}

/**
 * School identity for the top of a page: monogram, name, tagline and the public
 * contact block the print letterhead needs.
 *
 * A `null` from the API means the tenant has genuinely not set a value, and is
 * rendered as absent. The build-time branding config is only consulted while the
 * query has not resolved (`data === undefined`); it must never override an
 * explicit `null`, because that config belongs to the default school and would
 * print another school's identity on this tenant's document.
 */
export function PrintLetterhead({ identity }: { identity?: PrintLetterheadIdentity } = {}) {
  const { data } = useBranding()
  // A provided identity is a FROZEN snapshot value and wins over live branding. The
  // hook is still called unconditionally so the component's hook order is stable.
  const source = identity ?? data
  const loaded = source !== undefined
  const schoolName = (loaded ? source.schoolName : branding.schoolName) || branding.schoolName
  const tagline = loaded ? source.tagline : branding.schoolTagline
  const monogram = deriveMonogram(loaded ? source.schoolShortName : null, schoolName)

  // Guards null AND undefined: a printed legal document must degrade to a shorter
  // letterhead rather than throw and lose the whole page if a field is ever absent.
  const present = (parts: (string | null | undefined)[]): string =>
    parts
      .filter((part): part is string => part !== null && part !== undefined && part.trim() !== "")
      .map((part) => part.trim())
      .join(", ")

  const contact = loaded
    ? [present([source.addressLine1, source.addressLine2]), present([source.city, source.state, source.postalCode]), present([source.country])]
        .filter((line) => line !== "")
        .map((line) => line.trim())
    : []

  const phone = loaded ? source.contactPhone : null
  const email = loaded ? source.contactEmail : null
  const hasContactLine = phone !== null || email !== null

  return (
    /* A <div>, not a <header>: the print stylesheet hides every bare `header`
       to drop the app's sticky page header, and a semantic header element here
       would be caught by that same rule and vanish from the printed page. */
    <div data-print-letterhead className="print-document-letterhead">
      <div className="print-document-monogram" aria-hidden="true">
        {monogram}
      </div>
      <div className="min-w-0">
        <p className="print-document-school-name">{schoolName}</p>
        {tagline !== null && tagline !== undefined && tagline !== "" && (
          <p className="print-document-tagline">{tagline}</p>
        )}
        {contact.length > 0 && <p className="print-document-note mt-1">{contact.join(" · ")}</p>}
        {hasContactLine && (
          <p className="print-document-note">
            {[phone, email].filter((part) => part !== null && part !== "").join(" · ")}
          </p>
        )}
      </div>
    </div>
  )
}

export interface PrintTitleBlockProps {
  title: string
  eyebrow?: string
  subtitle?: string
}

/** The document's own identity: kicker, name, and the one-line scope. */
export function PrintTitleBlock({ title, eyebrow, subtitle }: PrintTitleBlockProps) {
  return (
    <div className="print-document-title-block">
      {eyebrow !== undefined && eyebrow !== "" && (
        <p className="print-document-eyebrow">{eyebrow}</p>
      )}
      <h1 className="print-document-title">{title}</h1>
      {subtitle !== undefined && subtitle !== "" && (
        <p className="print-document-subtitle">{subtitle}</p>
      )}
    </div>
  )
}

/**
 * The repeating footer band.
 *
 * It is `position: fixed` in the print stylesheet, which Chromium re-renders at
 * the foot of EVERY physical page — so a 6-page register carries the document's
 * identity on each page. `.print-document` reserves matching bottom padding so the
 * band can never overlap content.
 *
 * There is deliberately NO "Page N of M" here. Chromium honours neither CSS
 * `@page` margin boxes nor a per-page counter, so the number cannot be produced
 * honestly in a browser print; printing a fabricated or always-"1" page number on
 * a legal document is worse than omitting it. Documents that report a real scope
 * ("showing 20 of 60") state that in their own note instead.
 */
export function PrintFooter({
  documentTitle,
  schoolName: schoolNameOverride,
}: {
  documentTitle?: string
  /**
   * A FROZEN identity's school name, used in place of live tenant branding. The
   * footer carries the same identity as the letterhead so a historical document is
   * internally consistent.
   */
  schoolName?: string
}) {
  const { data } = useBranding()
  const schoolName = schoolNameOverride ?? (data?.schoolName || branding.schoolName)

  return (
    <div className="print-document-footer">
      <span className="print-document-footer-school">{schoolName}</span>
      {documentTitle !== undefined && documentTitle !== "" && (
        <>
          <span aria-hidden="true">·</span>
          <span>{documentTitle}</span>
        </>
      )}
      <span aria-hidden="true">·</span>
      <span>Printed {formatPrintedAt()}</span>
    </div>
  )
}

function formatPrintedAt(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}
