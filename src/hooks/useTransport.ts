import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { transportService } from "@/services/transportService"
import type {
  TransportAssignmentFormPayload,
  TransportAssignmentUpdatePayload,
  TransportAssignmentsQuery,
  TransportDriverFormPayload,
  TransportDriverUpdatePayload,
  TransportDriversQuery,
  TransportRouteFormPayload,
  TransportRouteUpdatePayload,
  TransportRoutesQuery,
  TransportStopFormPayload,
  TransportStopUpdatePayload,
  TransportStopsQuery,
  TransportVehicleFormPayload,
  TransportVehicleUpdatePayload,
  TransportVehiclesQuery,
} from "@/types/transport"

const GROUP = ["transport"] as const

// Vehicles

export function useTransportVehicles(query: TransportVehiclesQuery) {
  return useQuery({
    queryKey: ["transport", "vehicles", query],
    queryFn: () => transportService.listVehicles(query),
  })
}

export function useTransportVehicle(id: string | null) {
  return useQuery({
    queryKey: ["transport", "vehicle", id],
    queryFn: () => transportService.getVehicle(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useCreateTransportVehicle() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportVehicleFormPayload) => transportService.createVehicle(payload),
    onSuccess: (vehicle) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Vehicle added", { description: vehicle.registrationNumber })
    },
    onError: (e: Error) => toast.error("Could not add vehicle", { description: e.message }),
  })
}

export function useUpdateTransportVehicle(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportVehicleUpdatePayload) => transportService.updateVehicle(id ?? "", payload),
    onSuccess: (vehicle) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Vehicle updated", { description: vehicle.registrationNumber })
    },
    onError: (e: Error) => toast.error("Could not update vehicle", { description: e.message }),
  })
}

// Routes & stops

export function useTransportRoutes(query: TransportRoutesQuery) {
  return useQuery({
    queryKey: ["transport", "routes", query],
    queryFn: () => transportService.listRoutes(query),
  })
}

export function useTransportRoute(id: string | null) {
  return useQuery({
    queryKey: ["transport", "route", id],
    queryFn: () => transportService.getRoute(id ?? ""),
    enabled: Boolean(id),
  })
}

export function useCreateTransportRoute() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportRouteFormPayload) => transportService.createRoute(payload),
    onSuccess: (route) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Route added", { description: route.name })
    },
    onError: (e: Error) => toast.error("Could not add route", { description: e.message }),
  })
}

export function useUpdateTransportRoute(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportRouteUpdatePayload) => transportService.updateRoute(id ?? "", payload),
    onSuccess: (route) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Route updated", { description: route.name })
    },
    onError: (e: Error) => toast.error("Could not update route", { description: e.message }),
  })
}

export function useTransportStops(query: TransportStopsQuery, enabled = true) {
  return useQuery({
    queryKey: ["transport", "stops", query],
    queryFn: () => transportService.listStops(query),
    enabled,
  })
}

export function useCreateTransportStop(routeId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportStopFormPayload) => transportService.createStop(routeId ?? "", payload),
    onSuccess: (stop) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Stop added", { description: stop.name })
    },
    onError: (e: Error) => toast.error("Could not add stop", { description: e.message }),
  })
}

export function useUpdateTransportStop(routeId: string | null, stopId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportStopUpdatePayload) =>
      transportService.updateStop(routeId ?? "", stopId ?? "", payload),
    onSuccess: (stop) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Stop updated", { description: stop.name })
    },
    onError: (e: Error) => toast.error("Could not update stop", { description: e.message }),
  })
}

// Drivers

export function useTransportDrivers(query: TransportDriversQuery) {
  return useQuery({
    queryKey: ["transport", "drivers", query],
    queryFn: () => transportService.listDrivers(query),
  })
}

export function useCreateTransportDriver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportDriverFormPayload) => transportService.createDriver(payload),
    onSuccess: (driver) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Driver added", { description: driver.staffName })
    },
    onError: (e: Error) => toast.error("Could not add driver", { description: e.message }),
  })
}

export function useUpdateTransportDriver(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportDriverUpdatePayload) => transportService.updateDriver(id ?? "", payload),
    onSuccess: (driver) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Driver updated", { description: driver.staffName })
    },
    onError: (e: Error) => toast.error("Could not update driver", { description: e.message }),
  })
}

// Assignments

export function useTransportAssignments(query: TransportAssignmentsQuery) {
  return useQuery({
    queryKey: ["transport", "assignments", query],
    queryFn: () => transportService.listAssignments(query),
  })
}

export function useTransportAssignmentContext(studentSearch: string, enabled = true) {
  return useQuery({
    queryKey: ["transport", "assignments", "context", studentSearch],
    queryFn: () => transportService.getAssignmentContext(studentSearch),
    enabled,
    staleTime: 30_000,
  })
}

export function useCreateTransportAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportAssignmentFormPayload) => transportService.createAssignment(payload),
    onSuccess: (assignment) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Assignment created", { description: `${assignment.studentName} · ${assignment.routeName}` })
    },
    onError: (e: Error) => toast.error("Could not create assignment", { description: e.message }),
  })
}

export function useUpdateTransportAssignment(id: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: TransportAssignmentUpdatePayload) =>
      transportService.updateAssignment(id ?? "", payload),
    onSuccess: (assignment) => {
      qc.invalidateQueries({ queryKey: GROUP })
      toast.success("Assignment updated", { description: `${assignment.studentName} · ${assignment.routeName}` })
    },
    onError: (e: Error) => toast.error("Could not update assignment", { description: e.message }),
  })
}