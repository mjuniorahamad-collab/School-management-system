import type { ReactNode } from "react"

export interface PrintField {
  label: string
  value: ReactNode
}

/**
 * A label/value grid for a document's identity block. `columns` is explicit because
 * a five-field block and a fifteen-field block need different densities to stay
 * readable, and a 2-field block must not leave a third of the line empty.
 */
export function PrintFieldGrid({
  fields,
  columns = 3,
}: {
  fields: PrintField[]
  columns?: 2 | 3 | 4
}) {
  const gridClass =
    columns === 2 ? "grid-cols-2" : columns === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"

  return (
    <dl className={`grid gap-x-6 gap-y-2 ${gridClass}`}>
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="print-document-label">{field.label}</dt>
          <dd className="print-document-value break-words">{field.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** A named block within a document, e.g. "Fee breakdown" or "Emergency contact". */
export function PrintSection({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <section className="print-document-section-block">
      <h2 className="print-document-section">{title}</h2>
      {children}
    </section>
  )
}
