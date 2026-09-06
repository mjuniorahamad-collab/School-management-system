import type { TransportAssignmentStatus, TransportDirection } from "@prisma/client"

export const TRANSPORT_VEHICLE_CODE_PREFIX = "VEH" as const
export const DEFAULT_DRIVER_ROLE_LABEL = "Driver" as const

export function buildTransportVehicleCode(sequence: number): string {
  return `${TRANSPORT_VEHICLE_CODE_PREFIX}-${String(sequence).padStart(4, "0")}`
}

export function normalizeRegistrationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "")
}

export function joinName(firstName: string, middleName: string | null, lastName: string | null): string {
  return [firstName, middleName, lastName].filter((part) => part !== null && part !== "").join(" ")
}

/**
 * Capacity is a HARD ceiling. A route is at capacity once its ACTIVE
 * assignment count (for the session) is at or above the vehicle capacity.
 */
export function isAtCapacity(activeCount: number, capacity: number): boolean {
  return activeCount >= capacity
}

export function remainingSeats(activeCount: number, capacity: number): number {
  return Math.max(0, capacity - activeCount)
}

/**
 * Computes the new stop order for a route after moving `moveId` to
 * `targetIndex`. Returns the full ordered id list so the caller can renumber
 * every stop in one transaction (sortOrder is not unique, so reordering is
 * collision-safe and needs no two-phase renumber).
 */
export function computeStopOrder(ids: string[], moveId: string, targetIndex: number): string[] {
  const sourceIndex = ids.indexOf(moveId)
  if (sourceIndex === -1) return ids
  const clampedTarget = Math.max(0, Math.min(targetIndex, ids.length - 1))
  if (sourceIndex === clampedTarget) return ids
  const next = [...ids]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(clampedTarget, 0, moved)
  return next
}

export function normalizeAssignmentStatus(
  status: string | undefined,
): TransportAssignmentStatus | undefined {
  return status === "ACTIVE" || status === "INACTIVE" ? status : undefined
}

export function directionLabel(direction: TransportDirection): string {
  switch (direction) {
    case "TO_SCHOOL":
      return "to school"
    case "FROM_SCHOOL":
      return "from school"
    case "BOTH":
      return "both ways"
  }
}

/**
 * A seat is per-trip: TO_SCHOOL rides the morning trip only, FROM_SCHOOL the
 * afternoon trip only, BOTH counts as one seat on each trip. Capacity is a
 * per-trip hard ceiling.
 */
export interface TripCounts {
  morning: number
  afternoon: number
}

export function directionContribution(direction: TransportDirection): TripCounts {
  return {
    morning: direction === "FROM_SCHOOL" ? 0 : 1,
    afternoon: direction === "TO_SCHOOL" ? 0 : 1,
  }
}

export function tripPeak(counts: TripCounts): number {
  return Math.max(counts.morning, counts.afternoon)
}