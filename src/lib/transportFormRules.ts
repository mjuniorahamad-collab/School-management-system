import type {
  TransportAssignmentFormPayload,
  TransportDirection,
  TransportDriverFormPayload,
  TransportRouteFormPayload,
  TransportStopFormPayload,
  TransportVehicleFormPayload,
  TransportVehicleType,
} from "@/types/transport"

export const TRANSPORT_VEHICLE_CODE_PREFIX = "VEH" as const
export const DEFAULT_DRIVER_ROLE_LABEL = "Driver" as const
export const MAX_VEHICLE_CAPACITY = 1000

// Registration numbers are normalized like the backend: trimmed, uppercased,
// internal whitespace removed (e.g. "kca 123 a" -> "KCA123A").
export function normalizeRegistrationNumber(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "")
}

export interface TripCounts {
  morning: number
  afternoon: number
}

// A seat is per-trip: TO_SCHOOL rides the morning trip only, FROM_SCHOOL the
// afternoon trip only, BOTH counts as one seat on each trip. Mirrors the
// backend transport.rules semantics used for capacity checks.
export function directionContribution(direction: TransportDirection): TripCounts {
  return {
    morning: direction === "FROM_SCHOOL" ? 0 : 1,
    afternoon: direction === "TO_SCHOOL" ? 0 : 1,
  }
}

export function tripPeak(counts: TripCounts): number {
  return Math.max(counts.morning, counts.afternoon)
}

export function seatsRemainingOnRoute(capacity: number, counts: TripCounts): number {
  return Math.max(0, capacity - tripPeak(counts))
}

// ------------------------- Vehicle form -------------------------

export interface VehicleFormValue {
  registrationNumber: string
  type: TransportVehicleType
  make: string
  model: string
  year: string
  capacity: string
  notes: string
  isActive: boolean
}

export type VehicleFormError = { field: keyof VehicleFormValue; message: string }

export function defaultVehicleForm(): VehicleFormValue {
  return {
    registrationNumber: "",
    type: "OTHER",
    make: "",
    model: "",
    year: "",
    capacity: "",
    notes: "",
    isActive: true,
  }
}

export function validateVehicleForm(value: VehicleFormValue): VehicleFormError[] {
  const errors: VehicleFormError[] = []
  if (!value.registrationNumber.trim()) {
    errors.push({ field: "registrationNumber", message: "Registration number is required" })
  } else if (normalizeRegistrationNumber(value.registrationNumber).length > 50) {
    errors.push({ field: "registrationNumber", message: "Registration number is too long" })
  }
  if (value.make.trim().length > 100) errors.push({ field: "make", message: "Make is too long" })
  if (value.model.trim().length > 100) errors.push({ field: "model", message: "Model is too long" })
  if (value.notes.trim().length > 500) errors.push({ field: "notes", message: "Notes are too long" })

  const capacity = Number(value.capacity)
  if (!value.capacity.trim()) {
    errors.push({ field: "capacity", message: "Capacity is required" })
  } else if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_VEHICLE_CAPACITY) {
    errors.push({
      field: "capacity",
      message: `Capacity must be a whole number between 1 and ${MAX_VEHICLE_CAPACITY}`,
    })
  }

  if (value.year.trim()) {
    const year = Number(value.year)
    if (!Number.isInteger(year) || year < 1950 || year > 2100) {
      errors.push({ field: "year", message: "Year must be a whole number between 1950 and 2100" })
    }
  }
  return errors
}

export function vehicleFormToPayload(value: VehicleFormValue): TransportVehicleFormPayload {
  const payload: TransportVehicleFormPayload = {
    registrationNumber: normalizeRegistrationNumber(value.registrationNumber),
    capacity: Number(value.capacity),
    type: value.type,
    isActive: value.isActive,
  }
  if (value.make.trim()) payload.make = value.make.trim()
  if (value.model.trim()) payload.model = value.model.trim()
  if (value.year.trim()) payload.year = Number(value.year)
  if (value.notes.trim()) payload.notes = value.notes.trim()
  return payload
}

// ------------------------- Route form -------------------------

export interface RouteFormValue {
  name: string
  code: string
  vehicleId: string
  description: string
  isActive: boolean
}

export type RouteFormError = { field: keyof RouteFormValue; message: string }

export function defaultRouteForm(): RouteFormValue {
  return { name: "", code: "", vehicleId: "", description: "", isActive: true }
}

export function validateRouteForm(value: RouteFormValue): RouteFormError[] {
  const errors: RouteFormError[] = []
  if (!value.name.trim()) errors.push({ field: "name", message: "Route name is required" })
  if (value.name.trim().length > 150) errors.push({ field: "name", message: "Route name is too long" })
  if (value.code.trim().length > 50) errors.push({ field: "code", message: "Route code is too long" })
  if (value.description.trim().length > 500) {
    errors.push({ field: "description", message: "Description is too long" })
  }
  return errors
}

export function routeFormToPayload(value: RouteFormValue): TransportRouteFormPayload {
  const payload: TransportRouteFormPayload = { name: value.name.trim(), isActive: value.isActive }
  if (value.code.trim()) payload.code = value.code.trim()
  if (value.vehicleId) payload.vehicleId = value.vehicleId
  if (value.description.trim()) payload.description = value.description.trim()
  return payload
}

// ------------------------- Stop form -------------------------

export interface StopFormValue {
  name: string
}

export type StopFormError = { field: keyof StopFormValue; message: string }

export function defaultStopForm(): StopFormValue {
  return { name: "" }
}

export function validateStopForm(value: StopFormValue): StopFormError[] {
  const errors: StopFormError[] = []
  if (!value.name.trim()) errors.push({ field: "name", message: "Stop name is required" })
  if (value.name.trim().length > 150) errors.push({ field: "name", message: "Stop name is too long" })
  return errors
}

export function stopFormToPayload(value: StopFormValue): TransportStopFormPayload {
  return { name: value.name.trim() }
}

// ------------------------- Driver form -------------------------

export interface DriverFormValue {
  staffId: string
  routeId: string
  roleLabel: string
}

export type DriverFormError = { field: keyof DriverFormValue; message: string }

export function defaultDriverForm(): DriverFormValue {
  return { staffId: "", routeId: "", roleLabel: DEFAULT_DRIVER_ROLE_LABEL }
}

export function validateDriverForm(value: DriverFormValue): DriverFormError[] {
  const errors: DriverFormError[] = []
  if (!value.staffId) errors.push({ field: "staffId", message: "Select a staff member" })
  if (value.roleLabel.trim().length > 100) {
    errors.push({ field: "roleLabel", message: "Role label is too long" })
  }
  return errors
}

export function driverFormToPayload(value: DriverFormValue): TransportDriverFormPayload {
  const payload: TransportDriverFormPayload = { staffId: value.staffId }
  if (value.routeId) payload.routeId = value.routeId
  if (value.roleLabel.trim()) payload.roleLabel = value.roleLabel.trim()
  return payload
}

// ------------------------- Assignment form -------------------------

export interface AssignmentFormValue {
  studentId: string
  academicSessionId: string
  routeId: string
  stopId: string
  direction: TransportDirection
  notes: string
}

export type AssignmentFormError = { field: keyof AssignmentFormValue; message: string }

export function defaultAssignmentForm(): AssignmentFormValue {
  return { studentId: "", academicSessionId: "", routeId: "", stopId: "", direction: "TO_SCHOOL", notes: "" }
}

export function validateAssignmentForm(value: AssignmentFormValue): AssignmentFormError[] {
  const errors: AssignmentFormError[] = []
  if (!value.studentId) errors.push({ field: "studentId", message: "Select a student" })
  if (!value.academicSessionId) errors.push({ field: "academicSessionId", message: "Select a session" })
  if (!value.routeId) errors.push({ field: "routeId", message: "Select a route" })
  if (!value.stopId) errors.push({ field: "stopId", message: "Select a stop" })
  if (value.notes.trim().length > 500) errors.push({ field: "notes", message: "Notes are too long" })
  return errors
}

export function assignmentFormToPayload(value: AssignmentFormValue): TransportAssignmentFormPayload {
  const payload: TransportAssignmentFormPayload = {
    studentId: value.studentId,
    academicSessionId: value.academicSessionId,
    routeId: value.routeId,
    stopId: value.stopId,
    direction: value.direction,
  }
  if (value.notes.trim()) payload.notes = value.notes.trim()
  return payload
}