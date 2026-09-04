/**
 * Normalizes a subject code to a stable, search-friendly form: trims,
 * collapses internal whitespace, and uppercases. Keeps codes predictable.
 */
export function normalizeSubjectCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}
