// Shared CSV serialization for module exports (students, audit logs, reports).
//
// Normalizes the earlier per-module hand-rolled exports — students used CRLF
// row separators, audit logs used LF — to one canonical format:
//   - `\uFEFF` byte-order mark so Excel opens UTF-8 files correctly;
//   - CRLF row separators;
//   - every cell wrapped in double quotes with inner quotes doubled
//     (RFC 4180-style, matching the pattern the app has shipped since students).

export type CsvCell = string | number | boolean | null | undefined

function escapeCell(value: CsvCell): string {
  const text = String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * Serializes a header row plus data rows into a BOM-prefixed, CRLF-separated
 * CSV document. Each cell is quoted and inner quotes are doubled.
 */
export function rowsToCsv(
  header: readonly CsvCell[],
  rows: readonly (readonly CsvCell[])[],
): string {
  const body = [header, ...rows].map((row) => row.map(escapeCell).join(",")).join("\r\n")
  return `\uFEFF${body}\r\n`
}