import { attendanceRegisterLockedError, badRequestError } from "../../lib/ApiError.js"
import type { AttendanceRegisterStatusValue } from "./attendance-register.types.js"

// Canonical scopeKey for a class-level register (sectionId IS NULL). Matches the
// `attendance_register_scope_key_check` DB constraint. The server always derives
// this value; a client-supplied scopeKey is never trusted.
export const CLASS_SCOPE_KEY = "__CLASS__"

export function deriveScopeKey(sectionId: string | null): string {
  return sectionId ?? CLASS_SCOPE_KEY
}

// The register lifecycle is strictly forward: OPEN -> SUBMITTED -> VERIFIED.
// Reopening a VERIFIED register is not a normal transition — it is a dedicated,
// audited side effect of editing the calendar/placement that the register
// depends on (see reopenVerifiedRegisters* in the service).
const ALLOWED_TRANSITIONS: Record<AttendanceRegisterStatusValue, AttendanceRegisterStatusValue[]> = {
  OPEN: ["SUBMITTED"],
  SUBMITTED: ["VERIFIED"],
  VERIFIED: [],
}

export function assertRegisterTransition(
  from: AttendanceRegisterStatusValue,
  to: AttendanceRegisterStatusValue,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw badRequestError(`Attendance register cannot move from ${from} to ${to}`)
  }
}

/**
 * A register's attendance records may only change while it is OPEN. Once
 * SUBMITTED or VERIFIED the register is immutable until an audited reopen
 * (docs §8) — this is what makes a verified register trustworthy.
 */
export function assertRegisterAcceptsRecordMutation(status: AttendanceRegisterStatusValue): void {
  if (status !== "OPEN") throw attendanceRegisterLockedError()
}
