import type { LibraryCopyStatus } from "@prisma/client"

export const LIBRARY_COPY_CODE_PREFIX = "LIB" as const
export const LOAN_PERIOD_DAYS = 14
export const MAX_ACTIVE_LOANS_PER_BORROWER = 5

export type LibraryLoanStatus = "ON_LOAN" | "OVERDUE" | "RETURNED"

export function buildLibraryCopyCode(sequence: number): string {
  return `${LIBRARY_COPY_CODE_PREFIX}-${String(sequence).padStart(4, "0")}`
}

// Library dates are treated as UTC calendar dates (YYYY-MM-DD). They are built
// and compared in UTC so a DATE column round-trips through Prisma/Postgres
// without shifting for servers east of UTC (local-midnight Dates would drift a
// day when serialized).
export function toLocalDateString(value: Date): string {
  return value.toISOString().slice(0, 10)
}

export function todayLocalDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

export function addDays(dateString: string, days: number): string {
  const date = parseLocalDate(dateString)
  date.setDate(date.getDate() + days)
  return toLocalDateString(date)
}

export function joinName(firstName: string, middleName: string | null, lastName: string | null): string {
  return [firstName, middleName, lastName].filter((part) => part !== null && part !== "").join(" ")
}

export function normalizeBookIsbn(value: string): string {
  return value.trim().replace(/\s+/g, "")
}

export function deriveLoanStatus(
  returnedAt: Date | string | null,
  dueAt: Date | string,
  today = todayLocalDate(),
): LibraryLoanStatus {
  if (returnedAt !== null && returnedAt !== undefined) return "RETURNED"
  const dueString = typeof dueAt === "string" ? dueAt : toLocalDateString(dueAt)
  return dueString < today ? "OVERDUE" : "ON_LOAN"
}

export function canTransitionCopyStatus(
  current: LibraryCopyStatus,
  target: LibraryCopyStatus,
): { ok: boolean; reason?: string } {
  if (current === target) return { ok: true }
  if (current === "ISSUED") {
    return { ok: false, reason: "Issued copies must be returned before their status can be changed" }
  }
  if (target === "ISSUED") {
    return { ok: false, reason: "Copies become ISSUED only through the issue flow" }
  }
  return { ok: true }
}

export function isCopyAvailableForIssue(status: LibraryCopyStatus): boolean {
  return status === "AVAILABLE"
}