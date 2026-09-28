import type { CSSProperties, ReactNode } from "react"

export interface PrintTableColumn<T> {
  key: string
  header: string
  /** Right-aligns numeric and money columns. */
  numeric?: boolean
  /** Column width, e.g. "12%". Set on wide registers so columns size sensibly. */
  width?: string
  render: (row: T) => ReactNode
}

export interface PrintTableProps<T> {
  columns: PrintTableColumn<T>[]
  rows: T[]
  /** Stable key for a row; defaults to the column named `rowKey`. */
  rowKey: (row: T, index: number) => string
  caption?: string
  emptyMessage?: string
  /** Tighter type and padding, for registers with many columns. */
  compact?: boolean
  /** Rendered in a <tfoot>, so a totals row repeats on every page. */
  footer?: ReactNode
}

/**
 * A print table with a repeating header and body (`thead { display:
 * table-header-group }` in the print stylesheet), rows that never split across a
 * page break, and an optional repeating totals footer.
 *
 * Borders come from the print stylesheet alone (`.print-document th, td`). A
 * document must not add its own per-cell border, or it prints a different rule
 * from every other table in the app.
 */
export function PrintTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyMessage = "No records.",
  compact = false,
  footer,
}: PrintTableProps<T>) {
  const cellStyle = (column: PrintTableColumn<T>): CSSProperties | undefined =>
    column.width === undefined ? undefined : { width: column.width }

  return (
    <table
      className={`print-document-table w-full border-collapse ${
        compact === true ? "print-document-table-compact" : ""
      }`.trim()}
    >
      {caption !== undefined && <caption className="print-document-section text-left">{caption}</caption>}
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              style={cellStyle(column)}
              className={`font-semibold ${column.numeric === true ? "text-right" : "text-left"}`}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="text-center">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  style={cellStyle(column)}
                  className={column.numeric === true ? "text-right tabular-nums" : "text-left"}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
      {footer !== undefined && footer !== null && <tfoot>{footer}</tfoot>}
    </table>
  )
}
