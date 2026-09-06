import { api } from "@/lib/apiClient"
import type {
  TransportAssignmentContext,
  TransportAssignmentDetail,
  TransportAssignmentFormPayload,
  TransportAssignmentListResult,
  TransportAssignmentUpdatePayload,
  TransportAssignmentsQuery,
  TransportDriverFormPayload,
  TransportDriverDetail,
  TransportDriverListResult,
  TransportDriverUpdatePayload,
  TransportDriversQuery,
  TransportRouteDetail,
  TransportRouteFormPayload,
  TransportRouteListResult,
  TransportRouteUpdatePayload,
  TransportRoutesQuery,
  TransportStopDetail,
  TransportStopFormPayload,
  TransportStopListResult,
  TransportStopUpdatePayload,
  TransportStopsQuery,
  TransportVehicleDetail,
  TransportVehicleFormPayload,
  TransportVehicleListResult,
  TransportVehicleUpdatePayload,
  TransportVehiclesQuery,
} from "@/types/transport"

function queryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  return params.toString()
}

// Data seam for the Transport module. All calls hit the real REST API through
// the shared apiClient and return the unwrapped envelope payload.
export const transportService = {
  // Vehicles
  listVehicles(query: TransportVehiclesQuery = {}): Promise<TransportVehicleListResult> {
    const qs = queryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      type: query.type,
      isActive: query.isActive,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    })
    return api.get<TransportVehicleListResult>(`/transport/vehicles${qs ? `?${qs}` : ""}`)
  },

  getVehicle(id: string): Promise<TransportVehicleDetail> {
    return api.get<TransportVehicleDetail>(`/transport/vehicles/${id}`)
  },

  createVehicle(payload: TransportVehicleFormPayload): Promise<TransportVehicleDetail> {
    return api.post<TransportVehicleDetail>("/transport/vehicles", payload)
  },

  updateVehicle(id: string, payload: TransportVehicleUpdatePayload): Promise<TransportVehicleDetail> {
    return api.patch<TransportVehicleDetail>(`/transport/vehicles/${id}`, payload)
  },

  // Routes & stops
  listRoutes(query: TransportRoutesQuery = {}): Promise<TransportRouteListResult> {
    const qs = queryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      isActive: query.isActive,
    })
    return api.get<TransportRouteListResult>(`/transport/routes${qs ? `?${qs}` : ""}`)
  },

  getRoute(id: string): Promise<TransportRouteDetail> {
    return api.get<TransportRouteDetail>(`/transport/routes/${id}`)
  },

  createRoute(payload: TransportRouteFormPayload): Promise<TransportRouteDetail> {
    return api.post<TransportRouteDetail>("/transport/routes", payload)
  },

  updateRoute(id: string, payload: TransportRouteUpdatePayload): Promise<TransportRouteDetail> {
    return api.patch<TransportRouteDetail>(`/transport/routes/${id}`, payload)
  },

  listStops(query: TransportStopsQuery = {}): Promise<TransportStopListResult> {
    const qs = queryString({ routeId: query.routeId })
    return api.get<TransportStopListResult>(`/transport/stops${qs ? `?${qs}` : ""}`)
  },

  createStop(routeId: string, payload: TransportStopFormPayload): Promise<TransportStopDetail> {
    return api.post<TransportStopDetail>(`/transport/routes/${routeId}/stops`, payload)
  },

  updateStop(
    routeId: string,
    stopId: string,
    payload: TransportStopUpdatePayload,
  ): Promise<TransportStopDetail> {
    return api.patch<TransportStopDetail>(`/transport/routes/${routeId}/stops/${stopId}`, payload)
  },

  // Drivers
  listDrivers(query: TransportDriversQuery = {}): Promise<TransportDriverListResult> {
    const qs = queryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      routeId: query.routeId,
      isActive: query.isActive,
    })
    return api.get<TransportDriverListResult>(`/transport/drivers${qs ? `?${qs}` : ""}`)
  },

  createDriver(payload: TransportDriverFormPayload): Promise<TransportDriverDetail> {
    return api.post<TransportDriverDetail>("/transport/drivers", payload)
  },

  updateDriver(id: string, payload: TransportDriverUpdatePayload): Promise<TransportDriverDetail> {
    return api.patch<TransportDriverDetail>(`/transport/drivers/${id}`, payload)
  },

  // Assignments
  listAssignments(query: TransportAssignmentsQuery = {}): Promise<TransportAssignmentListResult> {
    const qs = queryString({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      routeId: query.routeId,
      studentId: query.studentId,
      academicSessionId: query.academicSessionId,
      direction: query.direction,
      status: query.status,
    })
    return api.get<TransportAssignmentListResult>(`/transport/assignments${qs ? `?${qs}` : ""}`)
  },

  getAssignmentContext(studentSearch?: string): Promise<TransportAssignmentContext> {
    const qs = queryString({ studentSearch })
    return api.get<TransportAssignmentContext>(`/transport/assignments/context${qs ? `?${qs}` : ""}`)
  },

  createAssignment(payload: TransportAssignmentFormPayload): Promise<TransportAssignmentDetail> {
    return api.post<TransportAssignmentDetail>("/transport/assignments", payload)
  },

  updateAssignment(
    id: string,
    payload: TransportAssignmentUpdatePayload,
  ): Promise<TransportAssignmentDetail> {
    return api.patch<TransportAssignmentDetail>(`/transport/assignments/${id}`, payload)
  },
}