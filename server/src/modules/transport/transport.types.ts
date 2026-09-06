import type {
  TransportAssignmentStatus,
  TransportDirection,
  TransportVehicleType,
} from "@prisma/client"

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

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