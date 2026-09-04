export function normalizeFeeHeadCode(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase()
}
