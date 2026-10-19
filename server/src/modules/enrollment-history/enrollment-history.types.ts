import type { ProvenanceValue } from "../academic-calendar/academic-calendar.types.js"

// Authoritative placement history (docs/academic-calendar.md §7). Append-only:
// a transfer closes the current period and opens a new one; nothing is
// overwritten except an audited retroactive correction.
export interface EnrollmentPeriodDetail {
  id: string
  studentId: string
  academicSessionId: string
  enrollmentId: string
  classId: string
  sectionId: string | null
  effectiveFrom: string
  effectiveTo: string | null
  source: ProvenanceValue
  confirmedAt: string | null
  confirmedByUserId: string | null
  createdAt: string
  updatedAt: string
}

export interface EnrollmentPeriodListResult {
  items: EnrollmentPeriodDetail[]
  total: number
}
