export function normalizeExamTypeCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}
