import type { ReactNode } from "react"

export type PrintTotalsVariant = "strip" | "ledger"

export interface PrintTotalItem {
  label: string
  value: ReactNode
  /** Small context line beneath the label, e.g. "after this receipt". */
  hint?: string
  /** The document's headline figure: rendered larger. */
  emphasis?: boolean
}

/**
 * Column count for the strip variant. Written as literal class strings because
 * Tailwind's JIT only emits what it can see in the source: an interpolated
 * `sm:grid-cols-${n}` would generate no rule at all and the strip would silently
 * collapse to one column on paper.
 */
const STRIP_GRID_CLASSES: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
}

/**
 * The money a financial document is actually about.
 *
 * Two shapes, because two shapes are genuinely different jobs:
 *   - `strip`  — a horizontal band of headline figures, centred, ruled above and
 *                below. For a receipt, where the amount received IS the document.
 *   - `ledger` — a right-aligned label/value column, the last row emphasised. For
 *                an invoice, where a breakdown table leads and the totals close it.
 *
 * Both never split across a page break (see the print stylesheet).
 */
export function PrintTotals({
  items,
  variant = "strip",
  emphasisLabel = "Total payable",
  className,
}: {
  items: PrintTotalItem[]
  variant?: PrintTotalsVariant
  /** In the ledger variant, the row drawn as the document's answer. */
  emphasisLabel?: string
  className?: string
}) {
  if (variant === "ledger") {
    return (
      <dl className={`print-document-totals print-document-totals-ledger ${className ?? ""}`.trim()}>
        {items.map((item) => {
          const emphasised = item.label === emphasisLabel
          return (
            <div key={item.label} className="print-document-total-row">
              <dt className={emphasised === true ? "print-document-total-emphasis" : undefined}>
                {item.label}
              </dt>
              <dd
                className={`text-right tabular-nums ${
                  emphasised === true ? "print-document-total-emphasis" : ""
                }`.trim()}
              >
                {item.value}
              </dd>
            </div>
          )
        })}
      </dl>
    )
  }

  const columns = Math.min(Math.max(items.length, 1), 4)

  return (
    <dl
      className={`print-document-totals print-document-totals-strip grid ${
        STRIP_GRID_CLASSES[columns] ?? "grid-cols-3"
      } ${className ?? ""}`.trim()}
    >
      {items.map((item) => (
        <div key={item.label} className="px-2 py-1 text-center">
          <dt className="print-document-label">{item.label}</dt>
          <dd
            className={
              item.emphasis === true
                ? "print-document-total-emphasis mt-0.5 tabular-nums"
                : "print-document-total mt-0.5 tabular-nums"
            }
          >
            {item.value}
          </dd>
          {item.hint !== undefined && item.hint !== "" && (
            <p className="print-document-note mt-0.5">{item.hint}</p>
          )}
        </div>
      ))}
    </dl>
  )
}
