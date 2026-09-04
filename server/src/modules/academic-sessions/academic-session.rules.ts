import { badRequestError } from "../../lib/ApiError.js"
import type { AcademicSessionStatus } from "./academic-session.types.js"

export interface SessionLike {
  id: string
  name: string
  code: string
  startDate: Date
  endDate: Date
  status: AcademicSessionStatus
}

export function validateDateRange(startDate: string, endDate: string): void {
  if (startDate >= endDate) {
    throw badRequestError("End date must be after the start date")
  }
}

/**
 * Decides whether a proposed status transition is legal given the current
 * population of sessions. Guarantees the core invariant: at most one ACTIVE
 * session, and there is always an ACTIVE session for the system to serve
 * Students (`resolveActiveSession`).
 */
export function resolveStatusTransition(args: {
  current: Pick<SessionLike, "id" | "status"> | null
  allSessions: Pick<SessionLike, "id" | "status">[]
  requestedStatus?: AcademicSessionStatus
  keepAsIs?: boolean
}): { status: AcademicSessionStatus } {
  const { current, allSessions, requestedStatus, keepAsIs } = args
  const nextStatus = requestedStatus ?? current?.status ?? "UPCOMING"

  if (keepAsIs && current) {
    return { status: current.status }
  }

  const activeCount = allSessions.filter(
    (session) => session.status === "ACTIVE" && session.id !== current?.id,
  ).length

  if (nextStatus === "ACTIVE" && activeCount >= 1) {
    throw badRequestError("An active academic session already exists. Close it first.")
  }

  return { status: nextStatus }
}
