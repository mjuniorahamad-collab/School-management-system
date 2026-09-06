// Domain types for the Transport module — vehicles, routes & stops, drivers,
// assignments. Mirrors the backend contracts under server/src/modules/transport/.
// Keep the two sides in sync when the API changes.

export const TRANSPORT_VEHICLE_TYPE_OPTIONS = ["BUS", "VAN", "MINI_BUS", "CAR", "OTHER"] as const
export type TransportVehicleType = (typeof TRANSPORT_VEHICLE_TYPE_OPTIONS)[number]

export const TRANSPORT_VEHICLE_TYPE_LABELS: Record<TransportVehicleType, string> = {
  BUS: "Bus",
  VAN: "Van",
  MINI_BUS: "Mini bus",
  CAR: "Car",
  OTHER: "Other",
}

export const TRANSPORT_DIRECTION_OPTIONS = ["TO_SCHOOL", "FROM_SCHOOL", "BOTH"] as const
export type TransportDirection = (typeof TRANSPORT_DIRECTION_OPTIONS)[number]

export const TRANSPORT_DIRECTION_LABELS: Record<TransportDirection, string> = {
  TO_SCHOOL: "To school",
  FROM_SCHOOL: "From school",
  BOTH: "Both ways",
}

export const TRANSPORT_ASSIGNMENT_STATUS_OPTIONS = ["ACTIVE", "INACTIVE"] as const
export type TransportAssignmentStatus = (typeof TRANSPORT_ASSIGNMENT_STATUS_OPTIONS)[number]

export const TRANSPORT_ASSIGNMENT_STATUS_LABELS: Record<TransportAssignmentStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

// ------------------------- Vehicles -------------------------

export interface TransportVehicleListItem {
  id: string
  registrationNumber: string
  vehicleCode: string
  type: TransportVehicleType
  make: string | null
  model: string | null
  year: number | null
  capacity: number
  isActive: boolean
  notes: string | null
  routeName: string | null
  seatsUsed: number
  createdAt: string
  updatedAt: string
}

export type TransportVehicleDetail = TransportVehicleListItem

export interface TransportVehicleListResult {
  items: TransportVehicleListItem[]
  pagination: Pagination
}

export interface TransportVehicleFormPayload {
  registrationNumber: string
  type?: TransportVehicleType
  make?: string
  model?: string
  year?: number
  capacity?: number
  isActive?: boolean
  notes?: string
}

export type TransportVehicleUpdatePayload = Partial<TransportVehicleFormPayload>

export interface TransportVehiclesQuery {
  page?: number
  pageSize?: number
  search?: string
  type?: TransportVehicleType
  isActive?: string
  sortBy?: "registrationNumber" | "vehicleCode" | "capacity" | "updatedAt"
  sortDir?: "asc" | "desc"
}

// ------------------------- Routes & stops -------------------------

export interface TransportStopDetail {
  id: string
  routeId: string
  name: string
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TransportRouteListItem {
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
  vehicleId: string | null
  vehicleRegistration: string | null
  vehicleCapacity: number | null
  stopCount: number
  driverCount: number
  seatsUsed: number
  createdAt: string
  updatedAt: string
}

export interface TransportRouteDetail extends Omit<TransportRouteListItem, "stopCount"> {
  stops: TransportStopDetail[]
}

export interface TransportRouteListResult {
  items: TransportRouteListItem[]
  pagination: Pagination
}

export interface TransportStopListResult {
  items: TransportStopDetail[]
  total: number
}

export interface TransportRouteFormPayload {
  name: string
  code?: string
  vehicleId?: string
  description?: string
  isActive?: boolean
}

export type TransportRouteUpdatePayload = Partial<
  Omit<TransportRouteFormPayload, "vehicleId"> & { vehicleId: string | null }
>

export interface TransportRoutesQuery {
  page?: number
  pageSize?: number
  search?: string
  isActive?: string
}

export interface TransportStopFormPayload {
  name: string
  sortOrder?: number
  isActive?: boolean
}

export type TransportStopUpdatePayload = Partial<TransportStopFormPayload>

export interface TransportStopsQuery {
  routeId?: string
}

// ------------------------- Drivers -------------------------

export interface TransportDriverListItem {
  id: string
  roleLabel: string
  isActive: boolean
  staffId: string
  staffName: string
  employeeId: string
  userId: string | null
  routeId: string | null
  routeName: string | null
  createdAt: string
  updatedAt: string
}

export interface TransportDriverListResult {
  items: TransportDriverListItem[]
  pagination: Pagination
}

export type TransportDriverDetail = TransportDriverListItem

export interface TransportDriverFormPayload {
  staffId: string
  routeId?: string
  userId?: string
  roleLabel?: string
}

export type TransportDriverUpdatePayload = Partial<
  Omit<TransportDriverFormPayload, "routeId" | "userId"> & {
    routeId: string | null
    userId: string | null
    isActive?: boolean
  }
>

export interface TransportDriversQuery {
  page?: number
  pageSize?: number
  search?: string
  routeId?: string
  isActive?: string
}

// ------------------------- Assignments -------------------------

export interface TransportAssignmentListItem {
  id: string
  studentId: string
  studentName: string
  admissionNumber: string
  academicSessionId: string
  sessionName: string
  routeId: string
  routeName: string
  stopId: string
  stopName: string
  direction: TransportDirection
  status: TransportAssignmentStatus
  vehicleRegistration: string | null
  vehicleCapacity: number | null
  assignedAt: string
  deactivatedAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type TransportAssignmentDetail = TransportAssignmentListItem

export interface TransportAssignmentListResult {
  items: TransportAssignmentListItem[]
  pagination: Pagination
}

export interface TransportAssignmentFormPayload {
  studentId: string
  academicSessionId: string
  routeId: string
  stopId: string
  direction: TransportDirection
  notes?: string
}

export interface TransportAssignmentUpdatePayload {
  status?: TransportAssignmentStatus
  notes?: string
}

export interface TransportAssignmentsQuery {
  page?: number
  pageSize?: number
  search?: string
  routeId?: string
  studentId?: string
  academicSessionId?: string
  direction?: TransportDirection
  status?: TransportAssignmentStatus
}

// ------------------------- Context -------------------------

export interface TransportSessionOption {
  id: string
  name: string
  code: string
  status: string
}

export interface TransportRouteOption {
  id: string
  name: string
  code: string | null
  vehicleRegistration: string | null
  capacity: number | null
  stops: Array<{ id: string; name: string }>
}

export interface TransportStudentOption {
  id: string
  name: string
  admissionNumber: string
}

export interface TransportAssignmentContext {
  sessions: TransportSessionOption[]
  routes: TransportRouteOption[]
  students: TransportStudentOption[]
}