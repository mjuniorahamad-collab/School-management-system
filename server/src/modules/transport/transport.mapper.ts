import { Prisma } from "@prisma/client"
import type { TransportStop, TransportVehicle } from "@prisma/client"
import { joinName } from "./transport.rules.js"
import type {
  TransportAssignmentListItem,
  TransportDriverListItem,
  TransportRouteDetail,
  TransportRouteListItem,
  TransportStopDetail,
  TransportVehicleListItem,
} from "./transport.types.js"

export const ROUTE_LIST_INCLUDE = {
  vehicle: { select: { id: true, registrationNumber: true, capacity: true, isActive: true } },
  _count: { select: { stops: true, drivers: true } },
} satisfies Prisma.TransportRouteInclude

export const ROUTE_DETAIL_INCLUDE = {
  vehicle: { select: { id: true, registrationNumber: true, capacity: true, isActive: true } },
  stops: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
  _count: { select: { drivers: true } },
} satisfies Prisma.TransportRouteInclude

export const DRIVER_INCLUDE = {
  staff: { select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true } },
  route: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.TransportDriverInclude

export const ASSIGNMENT_INCLUDE = {
  student: {
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
  },
  session: { select: { id: true, name: true, code: true, status: true } },
  route: {
    select: {
      id: true,
      name: true,
      isActive: true,
      vehicle: { select: { id: true, registrationNumber: true, capacity: true, isActive: true } },
    },
  },
  stop: { select: { id: true, name: true, isActive: true } },
} satisfies Prisma.TransportAssignmentInclude

export type RouteListRow = Prisma.TransportRouteGetPayload<{ include: typeof ROUTE_LIST_INCLUDE }>
export type RouteDetailRow = Prisma.TransportRouteGetPayload<{ include: typeof ROUTE_DETAIL_INCLUDE }>
export type DriverRow = Prisma.TransportDriverGetPayload<{ include: typeof DRIVER_INCLUDE }>
export type AssignmentRow = Prisma.TransportAssignmentGetPayload<{ include: typeof ASSIGNMENT_INCLUDE }>

export function toVehicleListItem(
  vehicle: Pick<
    TransportVehicle,
    | "id"
    | "registrationNumber"
    | "vehicleCode"
    | "type"
    | "make"
    | "model"
    | "year"
    | "capacity"
    | "isActive"
    | "notes"
    | "createdAt"
    | "updatedAt"
  >,
  extra: { routeName: string | null; seatsUsed: number },
): TransportVehicleListItem {
  return {
    id: vehicle.id,
    registrationNumber: vehicle.registrationNumber,
    vehicleCode: vehicle.vehicleCode,
    type: vehicle.type,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    capacity: vehicle.capacity,
    isActive: vehicle.isActive,
    notes: vehicle.notes,
    routeName: extra.routeName,
    seatsUsed: extra.seatsUsed,
    createdAt: vehicle.createdAt.toISOString(),
    updatedAt: vehicle.updatedAt.toISOString(),
  }
}

export function toRouteListItem(row: RouteListRow, seatsUsed: number): TransportRouteListItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: row.isActive,
    vehicleId: row.vehicle?.id ?? null,
    vehicleRegistration: row.vehicle?.registrationNumber ?? null,
    vehicleCapacity: row.vehicle?.capacity ?? null,
    stopCount: row._count.stops,
    driverCount: row._count.drivers,
    seatsUsed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toRouteDetail(row: RouteDetailRow, seatsUsed: number): TransportRouteDetail {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description,
    isActive: row.isActive,
    vehicleId: row.vehicle?.id ?? null,
    vehicleRegistration: row.vehicle?.registrationNumber ?? null,
    vehicleCapacity: row.vehicle?.capacity ?? null,
    driverCount: row._count.drivers,
    seatsUsed,
    stops: row.stops.map((stop) => toStopDetail(stop)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toStopDetail(
  stop: Pick<
    TransportStop,
    "id" | "routeId" | "name" | "sortOrder" | "isActive" | "createdAt" | "updatedAt"
  >,
): TransportStopDetail {
  return {
    id: stop.id,
    routeId: stop.routeId,
    name: stop.name,
    sortOrder: stop.sortOrder,
    isActive: stop.isActive,
    createdAt: stop.createdAt.toISOString(),
    updatedAt: stop.updatedAt.toISOString(),
  }
}

export function toDriverListItem(row: DriverRow): TransportDriverListItem {
  return {
    id: row.id,
    roleLabel: row.roleLabel,
    isActive: row.isActive,
    staffId: row.staffId,
    staffName: joinName(row.staff.firstName, row.staff.middleName, row.staff.lastName),
    employeeId: row.staff.employeeId,
    userId: row.userId,
    routeId: row.routeId,
    routeName: row.route?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toAssignmentListItem(row: AssignmentRow): TransportAssignmentListItem {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: joinName(row.student.firstName, row.student.middleName, row.student.lastName),
    admissionNumber: row.student.admissionNumber,
    academicSessionId: row.academicSessionId,
    sessionName: row.session.name,
    routeId: row.routeId,
    routeName: row.route.name,
    stopId: row.stopId,
    stopName: row.stop.name,
    direction: row.direction,
    status: row.status,
    vehicleRegistration: row.route.vehicle?.registrationNumber ?? null,
    vehicleCapacity: row.route.vehicle?.capacity ?? null,
    assignedAt: row.assignedAt.toISOString(),
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}