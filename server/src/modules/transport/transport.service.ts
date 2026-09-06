import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import {
  ASSIGNMENT_INCLUDE,
  DRIVER_INCLUDE,
  ROUTE_DETAIL_INCLUDE,
  ROUTE_LIST_INCLUDE,
  toAssignmentListItem,
  toDriverListItem,
  toRouteDetail,
  toRouteListItem,
  toStopDetail,
  toVehicleListItem,
  type AssignmentRow,
  type DriverRow,
  type RouteDetailRow,
  type RouteListRow,
} from "./transport.mapper.js"
import {
  buildTransportVehicleCode,
  computeStopOrder,
  DEFAULT_DRIVER_ROLE_LABEL,
  directionContribution,
  directionLabel,
  joinName,
  normalizeRegistrationNumber,
  tripPeak,
  type TripCounts,
} from "./transport.rules.js"
import type {
  CreateAssignmentInput,
  CreateDriverInput,
  CreateRouteInput,
  CreateStopInput,
  CreateVehicleInput,
  ListAssignmentContextQuery,
  ListAssignmentsQuery,
  ListDriversQuery,
  ListRoutesQuery,
  ListStopsQuery,
  ListVehiclesQuery,
  UpdateAssignmentInput,
  UpdateDriverInput,
  UpdateRouteInput,
  UpdateStopInput,
  UpdateVehicleInput,
} from "./transport.schema.js"
import type {
  TransportAssignmentContext,
  TransportAssignmentDetail,
  TransportAssignmentListResult,
  TransportDriverListResult,
  TransportRouteDetail,
  TransportRouteListResult,
  TransportStopDetail,
  TransportStopListResult,
  TransportVehicleDetail,
  TransportVehicleListResult,
} from "./transport.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>
type DbClient = PrismaClient | Prisma.TransactionClient

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function toPagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

// ────────────────────────────────────────────────────────────────────────────
// Shared aggregation helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Busiest-trip occupancy per route (peak of morning/afternoon rides across all
 * sessions). This is the honest occupancy to compare against the per-trip
 * capacity ceiling; a student riding BOTH counts as one seat on each trip.
 */
async function peaksByRoute(tx: DbClient, routeIds: string[]): Promise<Map<string, number>> {
  const peaks = new Map<string, number>()
  if (routeIds.length === 0) return peaks
  const rows = await tx.transportAssignment.findMany({
    where: { routeId: { in: routeIds }, status: "ACTIVE" },
    select: { routeId: true, academicSessionId: true, direction: true },
  })
  const byRouteSession = new Map<string, TripCounts>()
  for (const row of rows) {
    const key = `${row.routeId}:${row.academicSessionId}`
    const counts = byRouteSession.get(key) ?? { morning: 0, afternoon: 0 }
    const contribution = directionContribution(row.direction)
    counts.morning += contribution.morning
    counts.afternoon += contribution.afternoon
    byRouteSession.set(key, counts)
  }
  for (const [key, counts] of byRouteSession) {
    const routeId = key.split(":")[0] ?? ""
    peaks.set(routeId, Math.max(peaks.get(routeId) ?? 0, tripPeak(counts)))
  }
  return peaks
}

async function assertCapacityFitsRoute(
  tx: DbClient,
  routeId: string,
  capacity: number,
): Promise<void> {
  const rows = await tx.transportAssignment.findMany({
    where: { routeId, status: "ACTIVE" },
    select: { academicSessionId: true, direction: true },
  })
  const perSession = new Map<string, TripCounts>()
  for (const row of rows) {
    const counts = perSession.get(row.academicSessionId) ?? { morning: 0, afternoon: 0 }
    const contribution = directionContribution(row.direction)
    counts.morning += contribution.morning
    counts.afternoon += contribution.afternoon
    perSession.set(row.academicSessionId, counts)
  }
  const peak = Math.max(0, ...[...perSession.values()].map(tripPeak))
  if (peak > capacity) {
    throw badRequestError(
      `This route currently carries ${peak} students at peak so the selected vehicle needs at least ${peak} seats`,
    )
  }
}

async function tripCountsForRoute(
  tx: DbClient,
  routeId: string,
  academicSessionId: string,
): Promise<TripCounts> {
  const rows = await tx.transportAssignment.findMany({
    where: { routeId, academicSessionId, status: "ACTIVE" },
    select: { direction: true },
  })
  const counts: TripCounts = { morning: 0, afternoon: 0 }
  for (const row of rows) {
    const contribution = directionContribution(row.direction)
    counts.morning += contribution.morning
    counts.afternoon += contribution.afternoon
  }
  return counts
}

// ────────────────────────────────────────────────────────────────────────────
// Vehicles
// ────────────────────────────────────────────────────────────────────────────

export async function listVehicles(
  query: ListVehiclesQuery,
  schoolId: string,
): Promise<TransportVehicleListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TransportVehicleWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { registrationNumber: { contains: query.search, mode: "insensitive" } },
      { vehicleCode: { contains: query.search, mode: "insensitive" } },
      { make: { contains: query.search, mode: "insensitive" } },
      { model: { contains: query.search, mode: "insensitive" } },
    ]
  }
  if (query.type !== undefined) where.type = query.type
  if (query.isActive !== undefined) where.isActive = query.isActive === "true"

  const orderBy: Prisma.TransportVehicleOrderByWithRelationInput = {
    [query.sortBy ?? "updatedAt"]: query.sortDir,
  }

  const [total, rows] = await prisma.$transaction([
    prisma.transportVehicle.count({ where }),
    prisma.transportVehicle.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  const routes = await prisma.transportRoute.findMany({
    where: { schoolId, vehicleId: { in: rows.map((row) => row.id) } },
    select: { vehicleId: true, name: true },
  })
  const routeNameByVehicle = new Map(routes.map((route) => [route.vehicleId, route.name]))
  const peaks = await peaksByRoute(prisma, rows.map((row) => row.id))

  return {
    items: rows.map((row) =>
      toVehicleListItem(row, {
        routeName: routeNameByVehicle.get(row.id) ?? null,
        seatsUsed: peaks.get(row.id) ?? 0,
      }),
    ),
    pagination: toPagination(query.page, query.pageSize, total),
  }
}

export async function createVehicle(
  input: CreateVehicleInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportVehicleDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const registrationNumber = normalizeRegistrationNumber(input.registrationNumber)

  try {
    const vehicle = await prisma.$transaction(async (tx) => {
      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: { transportVehicleCounter: true },
      })
      if (!school) throw notFoundError("School not found")

      const row = await tx.transportVehicle.create({
        data: {
          schoolId,
          registrationNumber,
          vehicleCode: buildTransportVehicleCode(school.transportVehicleCounter),
          type: input.type ?? "BUS",
          make: input.make ?? null,
          model: input.model ?? null,
          year: input.year,
          capacity: input.capacity,
          isActive: input.isActive ?? true,
          notes: input.notes ?? null,
        },
      })

      await tx.school.update({
        where: { id: schoolId },
        data: { transportVehicleCounter: { increment: 1 } },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "TRANSPORT_VEHICLE",
        entityId: row.id,
        summary: `Added vehicle ${row.vehicleCode} (${registrationNumber})`,
        metadata: { registrationNumber: row.registrationNumber, capacity: row.capacity },
      })

      return row
    })

    return toVehicleListItem(vehicle, { routeName: null, seatsUsed: 0 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A vehicle with this registration number already exists")
    }
    throw error
  }
}

export async function updateVehicle(
  id: string,
  input: UpdateVehicleInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportVehicleDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.transportVehicle.findFirst({ where: { id, schoolId } })
  if (!existing) throw notFoundError("Vehicle not found")
  if (input.capacity !== undefined && input.capacity < 1) {
    throw badRequestError("Vehicle capacity must be at least 1")
  }
  if (Object.keys(input).length === 0) throw badRequestError("No changes to apply")

  const data: Prisma.TransportVehicleUncheckedUpdateInput = {}
  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []

  function setField(
    field: keyof Prisma.TransportVehicleUncheckedUpdateInput,
    before: unknown,
    after: unknown,
  ) {
    ;(data as Record<string, unknown>)[field] = after
    if (before !== after) {
      diffFields.push({ field, before, after })
    }
  }

  if (input.registrationNumber !== undefined) {
    setField(
      "registrationNumber",
      existing.registrationNumber,
      normalizeRegistrationNumber(input.registrationNumber),
    )
  }
  if (input.type !== undefined) setField("type", existing.type, input.type)
  if (input.make !== undefined) setField("make", existing.make, input.make ?? null)
  if (input.model !== undefined) setField("model", existing.model, input.model ?? null)
  if (input.year !== undefined) setField("year", existing.year, input.year)
  if (input.isActive !== undefined) setField("isActive", existing.isActive, input.isActive)
  if (input.notes !== undefined) setField("notes", existing.notes, input.notes ?? null)
  if (input.capacity !== undefined) setField("capacity", existing.capacity, input.capacity)

  if (input.capacity !== undefined && input.capacity < existing.capacity) {
    const requestedCapacity = input.capacity
    const route = await prisma.transportRoute.findFirst({
      where: { schoolId, vehicleId: id },
      select: { id: true },
    })
    if (route) {
      const peaks = await peaksByRoute(prisma, [route.id])
      const peakSeats = peaks.get(route.id) ?? 0
      if (peakSeats > requestedCapacity) {
        throw badRequestError(
          `Vehicle capacity cannot be lowered below ${peakSeats} current ride seats on its route`,
        )
      }
    }
  }

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    await prisma.$transaction(async (tx) => {
      await tx.transportVehicle.update({ where: { id }, data })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "TRANSPORT_VEHICLE",
        entityId: id,
        summary: `Updated vehicle ${existing.vehicleCode} (${existing.registrationNumber})`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })
    })
    return getVehicleById(id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A vehicle with this registration number already exists")
    }
    throw error
  }
}

export async function getVehicleById(
  id: string,
  schoolId: string,
): Promise<TransportVehicleDetail> {
  const prisma = await requirePrisma()
  const vehicle = await prisma.transportVehicle.findFirst({ where: { id, schoolId } })
  if (!vehicle) throw notFoundError("Vehicle not found")
  const routeName = await prisma.transportRoute.findFirst({
    where: { schoolId, vehicleId: id },
    select: { name: true },
  })
  const peaks = await peaksByRoute(prisma, [id])
  return toVehicleListItem(vehicle, {
    routeName: routeName?.name ?? null,
    seatsUsed: peaks.get(id) ?? 0,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────────────────

async function validateVehicleForRoute(
  tx: DbClient,
  vehicleId: string,
  schoolId: string,
  excludeRouteId?: string,
): Promise<{ registrationNumber: string; capacity: number }> {
  const vehicle = await tx.transportVehicle.findFirst({
    where: { id: vehicleId, schoolId, isActive: true },
    select: { registrationNumber: true, capacity: true },
  })
  if (!vehicle) throw badRequestError("Selected vehicle was not found or is not active")

  const occupied = await tx.transportRoute.findFirst({
    where: {
      schoolId,
      vehicleId,
      isActive: true,
      ...(excludeRouteId ? { id: { not: excludeRouteId } } : {}),
    },
    select: { id: true, name: true },
  })
  if (occupied) {
    throw badRequestError(`This vehicle is already assigned to the route "${occupied.name}"`)
  }
  return vehicle
}

export async function listRoutes(
  query: ListRoutesQuery,
  schoolId: string,
): Promise<TransportRouteListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TransportRouteWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: "insensitive" } },
      { code: { contains: query.search, mode: "insensitive" } },
    ]
  }
  if (query.isActive !== undefined) where.isActive = query.isActive === "true"

  const [total, rows] = await prisma.$transaction([
    prisma.transportRoute.count({ where }),
    prisma.transportRoute.findMany({
      where,
      include: ROUTE_LIST_INCLUDE,
      orderBy: [{ updatedAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  const peaks = await peaksByRoute(prisma, rows.map((row) => row.id))

  return {
    items: rows.map((row: RouteListRow) =>
      toRouteListItem(row, peaks.get(row.id) ?? 0),
    ),
    pagination: toPagination(query.page, query.pageSize, total),
  }
}

export async function getRouteDetail(
  id: string,
  schoolId: string,
): Promise<TransportRouteDetail> {
  const prisma = await requirePrisma()
  const row = await prisma.transportRoute.findFirst({
    where: { id, schoolId },
    include: ROUTE_DETAIL_INCLUDE,
  })
  if (!row) throw notFoundError("Route not found")
  const peaks = await peaksByRoute(prisma, [id])
  return toRouteDetail(row as RouteDetailRow, peaks.get(id) ?? 0)
}

export async function createRoute(
  input: CreateRouteInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportRouteDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const created = await prisma.$transaction(async (tx) => {
      if (input.vehicleId !== undefined) {
        await validateVehicleForRoute(tx, input.vehicleId, schoolId)
      }

      const row = await tx.transportRoute.create({
        data: {
          schoolId,
          name: input.name,
          code: input.code ?? null,
          vehicleId: input.vehicleId,
          description: input.description ?? null,
          isActive: input.isActive ?? true,
        },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "TRANSPORT_ROUTE",
        entityId: row.id,
        summary: `Created route "${row.name}"`,
      })

      return row
    })
    return getRouteDetail(created.id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("This vehicle is already assigned to another route")
    }
    throw error
  }
}

export async function updateRoute(
  id: string,
  input: UpdateRouteInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportRouteDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.transportRoute.findFirst({
    where: { id, schoolId },
    select: { id: true, name: true, code: true, description: true, isActive: true, vehicleId: true },
  })
  if (!existing) throw notFoundError("Route not found")
  if (Object.keys(input).length === 0) throw badRequestError("No changes to apply")

  const data: Prisma.TransportRouteUncheckedUpdateInput = {}
  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []

  function setField(
    field: keyof Prisma.TransportRouteUncheckedUpdateInput,
    before: unknown,
    after: unknown,
  ) {
    ;(data as Record<string, unknown>)[field] = after
    if (before !== after) {
      diffFields.push({ field, before, after })
    }
  }

  if (input.name !== undefined) setField("name", existing.name, input.name)
  if (input.code !== undefined) setField("code", existing.code, input.code ?? null)
  if (input.description !== undefined) {
    setField("description", existing.description, input.description ?? null)
  }
  if (input.isActive !== undefined) setField("isActive", existing.isActive, input.isActive)

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    await prisma.$transaction(async (tx) => {
      let nextVehicleId = existing.vehicleId
      if (input.vehicleId !== undefined) {
        const resolved = input.vehicleId ?? null
        if (resolved !== existing.vehicleId) {
          if (resolved !== null) {
            const vehicle = await validateVehicleForRoute(tx, resolved, schoolId, id)
            await assertCapacityFitsRoute(tx, id, vehicle.capacity)
          }
          setField("vehicleId", existing.vehicleId, resolved)
          nextVehicleId = resolved
        }
      }
      data.vehicleId = nextVehicleId ?? null

      await tx.transportRoute.update({ where: { id }, data })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "TRANSPORT_ROUTE",
        entityId: id,
        summary: `Updated route "${existing.name}"`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })
    })
    return getRouteDetail(id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("This vehicle is already assigned to another route")
    }
    throw error
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Stops
// ────────────────────────────────────────────────────────────────────────────

export async function listStops(
  query: ListStopsQuery,
  schoolId: string,
): Promise<TransportStopListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TransportStopWhereInput = { route: { schoolId } }
  if (query.routeId !== undefined) {
    const route = await prisma.transportRoute.findFirst({
      where: { id: query.routeId, schoolId },
      select: { id: true },
    })
    if (!route) throw notFoundError("Route not found")
    where.routeId = query.routeId
  }

  const stops = await prisma.transportStop.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })

  return { items: stops.map(toStopDetail), total: stops.length }
}

export async function createStop(
  routeId: string,
  input: CreateStopInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportStopDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const created = await prisma.$transaction(async (tx) => {
    const route = await tx.transportRoute.findFirst({
      where: { id: routeId, schoolId },
      select: { id: true, name: true },
    })
    if (!route) throw notFoundError("Route not found")

    const duplicate = await tx.transportStop.findFirst({
      where: { routeId, name: input.name },
      select: { id: true },
    })
    if (duplicate) {
      throw badRequestError(`A stop named "${input.name}" already exists on this route`)
    }

    const aggregation = await tx.transportStop.aggregate({
      where: { routeId },
      _max: { sortOrder: true },
    })

    const row = await tx.transportStop.create({
      data: {
        routeId,
        schoolId,
        name: input.name,
        sortOrder: (aggregation._max.sortOrder ?? 0) + 1,
      },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "CREATE",
      entityType: "TRANSPORT_STOP",
      entityId: row.id,
      summary: `Added stop "${row.name}" to route "${route.name}"`,
    })

    return row
  })

  return toStopDetail(created)
}

export async function updateStop(
  routeId: string,
  stopId: string,
  input: UpdateStopInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportStopDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.transportStop.findFirst({
    where: { id: stopId, routeId, schoolId },
    select: { id: true, name: true, sortOrder: true, isActive: true, routeId: true },
  })
  if (!existing) throw notFoundError("Stop not found")
  if (Object.keys(input).length === 0) throw badRequestError("No changes to apply")

  const data: Prisma.TransportStopUncheckedUpdateInput = {}
  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []

  function setField(
    field: keyof Prisma.TransportStopUncheckedUpdateInput,
    before: unknown,
    after: unknown,
  ) {
    ;(data as Record<string, unknown>)[field] = after
    if (before !== after) {
      diffFields.push({ field, before, after })
    }
  }

  if (input.name !== undefined) setField("name", existing.name, input.name)
  if (input.isActive !== undefined) setField("isActive", existing.isActive, input.isActive)

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  await prisma.$transaction(async (tx) => {
    if (input.name !== undefined && input.name !== existing.name) {
      const duplicate = await tx.transportStop.findFirst({
        where: { routeId, name: input.name, id: { not: stopId } },
        select: { id: true },
      })
      if (duplicate) {
        throw badRequestError(`A stop named "${input.name}" already exists on this route`)
      }
    }

    if (input.sortOrder !== undefined && input.sortOrder !== existing.sortOrder) {
      const orderedIds = (
        await tx.transportStop.findMany({
          where: { routeId },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true },
        })
      ).map((stop) => stop.id)
      const currentPosition = orderedIds.indexOf(stopId)
      const targetIndex = Math.max(0, Math.min(input.sortOrder, orderedIds.length - 1))
      if (input.sortOrder !== currentPosition) {
        const reordered = computeStopOrder(orderedIds, stopId, targetIndex)
        await Promise.all(
          reordered.map((id, index) =>
            tx.transportStop.update({
              where: { id },
              data: { sortOrder: index + 1 },
            }),
          ),
        )
        setField("sortOrder", currentPosition + 1, reordered.indexOf(stopId) + 1)
      }
    }

    await tx.transportStop.update({ where: { id: stopId }, data })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "UPDATE",
      entityType: "TRANSPORT_STOP",
      entityId: stopId,
      summary: `Updated stop "${existing.name}"`,
      diff: diffFields.length > 0 ? { fields: diffFields } : null,
    })
  })

  const refreshed = await prisma.transportStop.findUnique({
    where: { id: stopId },
  })
  if (!refreshed) throw notFoundError("Stop not found")
  return toStopDetail(refreshed)
}

// ────────────────────────────────────────────────────────────────────────────
// Drivers
// ────────────────────────────────────────────────────────────────────────────

export async function listDrivers(
  query: ListDriversQuery,
  schoolId: string,
): Promise<TransportDriverListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TransportDriverWhereInput = { schoolId }
  if (query.routeId !== undefined) {
    const route = await prisma.transportRoute.findFirst({
      where: { id: query.routeId, schoolId },
      select: { id: true },
    })
    if (!route) throw notFoundError("Route not found")
    where.routeId = query.routeId
  }
  if (query.isActive !== undefined) where.isActive = query.isActive === "true"
  if (query.search) {
    where.OR = [
      { staff: { firstName: { contains: query.search, mode: "insensitive" } } },
      { staff: { middleName: { contains: query.search, mode: "insensitive" } } },
      { staff: { lastName: { contains: query.search, mode: "insensitive" } } },
      { staff: { employeeId: { contains: query.search, mode: "insensitive" } } },
      { roleLabel: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.transportDriver.count({ where }),
    prisma.transportDriver.findMany({
      where,
      include: DRIVER_INCLUDE,
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  return {
    items: rows.map((row: DriverRow) => toDriverListItem(row)),
    pagination: toPagination(query.page, query.pageSize, total),
  }
}

export async function createDriver(
  input: CreateDriverInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportDriverListResult["items"][number]> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const driver = await prisma.$transaction(async (tx) => {
      const staff = await tx.staff.findFirst({
        where: { id: input.staffId, schoolId, status: "ACTIVE" },
        select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
      })
      if (!staff) throw badRequestError("Selected staff member was not found or is not active")

      if (input.routeId !== undefined) {
        const route = await tx.transportRoute.findFirst({
          where: { id: input.routeId, schoolId, isActive: true },
          select: { id: true },
        })
        if (!route) throw badRequestError("Selected route was not found or is not active")
      }

      if (input.userId !== undefined) {
        const user = await tx.user.findFirst({
          where: { id: input.userId, schoolId, status: "ACTIVE" },
          select: { id: true },
        })
        if (!user) throw badRequestError("Selected user was not found or is not active")
      }

      const row = await tx.transportDriver.create({
        data: {
          schoolId,
          staffId: staff.id,
          routeId: input.routeId,
          userId: input.userId,
          roleLabel: input.roleLabel ?? DEFAULT_DRIVER_ROLE_LABEL,
        },
        include: DRIVER_INCLUDE,
      })

      const name = joinName(staff.firstName, staff.middleName, staff.lastName)
      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "TRANSPORT_DRIVER",
        entityId: row.id,
        summary: `Added ${name} as a transport driver`,
        metadata: { staffId: staff.id, name },
      })

      return row
    })

    return toDriverListItem(driver as DriverRow)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("This staff member is already a transport driver")
    }
    throw error
  }
}

export async function updateDriver(
  id: string,
  input: UpdateDriverInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportDriverListResult["items"][number]> {
  const prisma = await requirePrisma()
  const existing = await prisma.transportDriver.findFirst({
    where: { id, schoolId },
    include: DRIVER_INCLUDE,
  })
  if (!existing) throw notFoundError("Driver not found")
  if (Object.keys(input).length === 0) throw badRequestError("No changes to apply")

  const staffName = joinName(existing.staff.firstName, existing.staff.middleName, existing.staff.lastName)

  const data: Prisma.TransportDriverUncheckedUpdateInput = {}
  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []

  function setField(
    field: keyof Prisma.TransportDriverUncheckedUpdateInput,
    before: unknown,
    after: unknown,
  ) {
    ;(data as Record<string, unknown>)[field] = after
    if (before !== after) {
      diffFields.push({ field, before, after })
    }
  }

  if (input.isActive !== undefined) setField("isActive", existing.isActive, input.isActive)
  if (input.roleLabel !== undefined) setField("roleLabel", existing.roleLabel, input.roleLabel)

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (input.staffId !== undefined && input.staffId !== existing.staffId) {
        const staff = await tx.staff.findFirst({
          where: { id: input.staffId, schoolId, status: "ACTIVE" },
          select: { id: true },
        })
        if (!staff) throw badRequestError("Selected staff member was not found or is not active")
        const duplicate = await tx.transportDriver.findFirst({
          where: { schoolId, staffId: input.staffId, id: { not: id } },
          select: { id: true },
        })
        if (duplicate) {
          throw badRequestError("This staff member is already a transport driver")
        }
        setField("staffId", existing.staffId, input.staffId)
      }

      if (input.routeId !== undefined && (input.routeId ?? null) !== existing.routeId) {
        if (input.routeId !== null) {
          const route = await tx.transportRoute.findFirst({
            where: { id: input.routeId, schoolId, isActive: true },
            select: { id: true },
          })
          if (!route) throw badRequestError("Selected route was not found or is not active")
        }
        setField("routeId", existing.routeId, input.routeId)
      }

      if (input.userId !== undefined && (input.userId ?? null) !== existing.userId) {
        if (input.userId !== null) {
          const user = await tx.user.findFirst({
            where: { id: input.userId, schoolId, status: "ACTIVE" },
            select: { id: true },
          })
          if (!user) throw badRequestError("Selected user was not found or is not active")
        }
        setField("userId", existing.userId, input.userId)
      }

      const row = await tx.transportDriver.update({
        where: { id },
        data,
        include: DRIVER_INCLUDE,
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "TRANSPORT_DRIVER",
        entityId: id,
        summary: `Updated driver "${staffName}"`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })

      return row
    })
    return toDriverListItem(updated as DriverRow)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("This staff member is already a transport driver")
    }
    throw error
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Assignments
// ────────────────────────────────────────────────────────────────────────────

export async function listAssignments(
  query: ListAssignmentsQuery,
  schoolId: string,
): Promise<TransportAssignmentListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.TransportAssignmentWhereInput = { schoolId }
  if (query.routeId !== undefined) {
    const route = await prisma.transportRoute.findFirst({
      where: { id: query.routeId, schoolId },
      select: { id: true },
    })
    if (!route) throw notFoundError("Route not found")
    where.routeId = query.routeId
  }
  if (query.studentId !== undefined) {
    const student = await prisma.student.findFirst({
      where: { id: query.studentId, schoolId },
      select: { id: true },
    })
    if (!student) throw notFoundError("Student not found")
    where.studentId = query.studentId
  }
  if (query.academicSessionId !== undefined) {
    const session = await prisma.academicSession.findFirst({
      where: { id: query.academicSessionId, schoolId },
      select: { id: true },
    })
    if (!session) throw notFoundError("Session not found")
    where.academicSessionId = query.academicSessionId
  }
  if (query.direction !== undefined) where.direction = query.direction
  if (query.status !== undefined) where.status = query.status
  if (query.search) {
    where.OR = [
      { student: { firstName: { contains: query.search, mode: "insensitive" } } },
      { student: { middleName: { contains: query.search, mode: "insensitive" } } },
      { student: { lastName: { contains: query.search, mode: "insensitive" } } },
      { student: { admissionNumber: { contains: query.search, mode: "insensitive" } } },
      { route: { name: { contains: query.search, mode: "insensitive" } } },
      { stop: { name: { contains: query.search, mode: "insensitive" } } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.transportAssignment.count({ where }),
    prisma.transportAssignment.findMany({
      where,
      include: ASSIGNMENT_INCLUDE,
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  return {
    items: rows.map((row: AssignmentRow) => toAssignmentListItem(row)),
    pagination: toPagination(query.page, query.pageSize, total),
  }
}

export async function getAssignmentContext(
  query: ListAssignmentContextQuery,
  schoolId: string,
): Promise<TransportAssignmentContext> {
  const prisma = await requirePrisma()

  const sessions = await prisma.academicSession.findMany({
    where: { schoolId, status: { in: ["ACTIVE", "UPCOMING"] } },
    select: { id: true, name: true, code: true, status: true },
    orderBy: [{ startDate: "asc" }],
  })

  const routes = await prisma.transportRoute.findMany({
    where: { schoolId, isActive: true },
    include: {
      vehicle: { select: { registrationNumber: true, capacity: true } },
      stops: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
    orderBy: [{ name: "asc" }],
  })
  const peaks = await peaksByRoute(prisma, routes.map((route) => route.id))

  const students = await prisma.student.findMany({
    where: {
      schoolId,
      status: "ACTIVE",
      ...(query.studentSearch
        ? {
            OR: [
              { firstName: { contains: query.studentSearch, mode: "insensitive" } },
              { middleName: { contains: query.studentSearch, mode: "insensitive" } },
              { lastName: { contains: query.studentSearch, mode: "insensitive" } },
              { admissionNumber: { contains: query.studentSearch, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
    orderBy: [{ firstName: "asc" }],
    take: 25,
  })

  return {
    sessions,
    routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      code: route.code,
      vehicleRegistration: route.vehicle?.registrationNumber ?? null,
      capacity: route.vehicle?.capacity ?? null,
      seatsUsed: peaks.get(route.id) ?? 0,
      stops: route.stops.map((stop) => ({ id: stop.id, name: stop.name })),
    })),
    students: students.map((student) => ({
      id: student.id,
      name: joinName(student.firstName, student.middleName, student.lastName),
      admissionNumber: student.admissionNumber,
    })),
  }
}

async function loadAssignment(
  prisma: PrismaClient,
  id: string,
  schoolId: string,
): Promise<AssignmentRow | null> {
  return prisma.transportAssignment.findFirst({
    where: { id, schoolId },
    include: ASSIGNMENT_INCLUDE,
  })
}

export async function createAssignment(
  input: CreateAssignmentInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportAssignmentDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const createdId = await prisma.$transaction(async (tx) => {
    const student = await tx.student.findFirst({
      where: { id: input.studentId, schoolId, status: "ACTIVE" },
      select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
    })
    if (!student) throw badRequestError("Selected student was not found or is not active")

    const session = await tx.academicSession.findFirst({
      where: { id: input.academicSessionId, schoolId },
      select: { id: true, name: true, status: true },
    })
    if (!session) throw badRequestError("Selected academic session was not found")
    if (session.status === "CLOSED") {
      throw badRequestError("Assignments cannot be created for a closed session")
    }

    const route = await tx.transportRoute.findFirst({
      where: { id: input.routeId, schoolId, isActive: true },
      include: {
        vehicle: { select: { id: true, registrationNumber: true, capacity: true, isActive: true } },
      },
    })
    if (!route) throw badRequestError("Selected route was not found or is not active")
    if (!route.vehicle || !route.vehicle.isActive) {
      throw badRequestError("Selected route does not have an active vehicle")
    }

    const stop = await tx.transportStop.findFirst({
      where: { id: input.stopId, routeId: route.id, schoolId },
      select: { id: true, name: true, isActive: true },
    })
    if (!stop) throw badRequestError("Selected stop was not found on this route")
    if (!stop.isActive) throw badRequestError("Selected stop is inactive")

    const prior = await tx.transportAssignment.findFirst({
      where: {
        studentId: student.id,
        academicSessionId: session.id,
        direction: input.direction,
        status: "ACTIVE",
      },
      select: { id: true, routeId: true, stopId: true, direction: true },
    })

    if (prior && prior.routeId === route.id) {
      if (prior.stopId === stop.id) {
        throw badRequestError(
          `${joinName(student.firstName, student.middleName, student.lastName)} is already assigned to this route, stop and direction for this session`,
        )
      }
    }

    const activeForSession = await tripCountsForRoute(tx, route.id, session.id)
    if (prior && prior.routeId === route.id) {
      const contribution = directionContribution(prior.direction)
      activeForSession.morning -= contribution.morning
      activeForSession.afternoon -= contribution.afternoon
    }
    const addition = directionContribution(input.direction)
    if (
      activeForSession.morning + addition.morning > route.vehicle.capacity ||
      activeForSession.afternoon + addition.afternoon > route.vehicle.capacity
    ) {
      throw badRequestError(
        `Route "${route.name}" is at full capacity (${route.vehicle.capacity} seats per trip)`,
      )
    }

    const row = await tx.transportAssignment.create({
      data: {
        schoolId,
        studentId: student.id,
        academicSessionId: session.id,
        routeId: route.id,
        stopId: stop.id,
        direction: input.direction,
        status: "ACTIVE",
        assignedAt: new Date(),
        notes: input.notes ?? null,
      },
    })

    if (prior) {
      await tx.transportAssignment.update({
        where: { id: prior.id },
        data: { status: "INACTIVE", deactivatedAt: new Date() },
      })
    }

    const studentName = joinName(student.firstName, student.middleName, student.lastName)
    const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
    if (prior) {
      if (prior.routeId !== route.id) {
        diffFields.push({ field: "routeId", before: prior.routeId, after: route.id })
      }
      if (prior.stopId !== stop.id) {
        diffFields.push({ field: "stopId", before: prior.stopId, after: stop.id })
      }
    }

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "ASSIGN",
      entityType: "TRANSPORT_ASSIGNMENT",
      entityId: row.id,
      summary: `Assigned ${studentName} to route "${route.name}" (${directionLabel(input.direction)}) for ${session.name}`,
      metadata: {
        studentId: student.id,
        sessionId: session.id,
        routeId: route.id,
        stopId: stop.id,
        direction: input.direction,
        replacedAssignmentId: prior?.id ?? null,
        vehicleRegistration: route.vehicle.registrationNumber,
      },
      diff: diffFields.length > 0 ? { fields: diffFields } : null,
    })

    return row.id
  })

  const created = await loadAssignment(prisma, createdId, schoolId)
  if (!created) throw notFoundError("Assignment not found")
  return toAssignmentListItem(created)
}

export async function updateAssignment(
  id: string,
  input: UpdateAssignmentInput,
  schoolId: string,
  actor: AuthUser,
): Promise<TransportAssignmentDetail> {
  const prisma = await requirePrisma()
  const existing = await loadAssignment(prisma, id, schoolId)
  if (!existing) throw notFoundError("Assignment not found")

  const statusChanged = input.status !== undefined && input.status !== existing.status
  const notesChanged =
    input.notes !== undefined && (input.notes ?? null) !== existing.notes
  if (!statusChanged && !notesChanged) throw badRequestError("No changes to apply")

  const studentName = joinName(
    existing.student.firstName,
    existing.student.middleName,
    existing.student.lastName,
  )
  const nextStatus = input.status as "ACTIVE" | "INACTIVE" | undefined

  const data: Prisma.TransportAssignmentUncheckedUpdateInput = {}
  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const updatedId = await prisma.$transaction(async (tx) => {
    if (statusChanged) {
      if (nextStatus === "ACTIVE") {
        const session = await tx.academicSession.findFirst({
          where: { id: existing.academicSessionId, schoolId },
          select: { status: true, name: true },
        })
        if (!session || session.status === "CLOSED") {
          throw badRequestError(`Cannot reactivate an assignment for a closed session`)
        }
        if (!existing.route.isActive || !existing.route.vehicle?.isActive) {
          throw badRequestError("The assigned route no longer has an active vehicle")
        }
        if (!existing.stop.isActive) {
          throw badRequestError("The assigned stop is no longer active")
        }
        const duplicate = await tx.transportAssignment.findFirst({
          where: {
            studentId: existing.studentId,
            academicSessionId: existing.academicSessionId,
            direction: existing.direction,
            status: "ACTIVE",
            id: { not: id },
          },
          select: { id: true },
        })
        if (duplicate) {
          throw badRequestError(
            `${studentName} already has an active ${directionLabel(existing.direction)} assignment for this session`,
          )
        }
        const served = await tripCountsForRoute(tx, existing.routeId, existing.academicSessionId)
        const addition = directionContribution(existing.direction)
        if (
          served.morning + addition.morning > (existing.route.vehicle?.capacity ?? 0) ||
          served.afternoon + addition.afternoon > (existing.route.vehicle?.capacity ?? 0)
        ) {
          throw badRequestError(
            `Route "${existing.route.name}" is at full capacity (${existing.route.vehicle?.capacity ?? 0} seats per trip)`,
          )
        }
      }
      data.status = nextStatus
      data.deactivatedAt = nextStatus === "INACTIVE" ? new Date() : null
      diffFields.push({ field: "status", before: existing.status, after: nextStatus })
    }

    if (notesChanged) {
      data.notes = input.notes ?? null
      diffFields.push({ field: "notes", before: existing.notes, after: input.notes ?? null })
    }

    const row = await tx.transportAssignment.update({ where: { id }, data })

    if (statusChanged) {
      const action = nextStatus as "ACTIVE" | "INACTIVE"
      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "STATUS_CHANGE",
        entityType: "TRANSPORT_ASSIGNMENT",
        entityId: id,
        summary:
          action === "ACTIVE"
            ? `Reactivated ${studentName}'s ${directionLabel(existing.direction)} assignment on route "${existing.route.name}"`
            : `Deactivated ${studentName}'s ${directionLabel(existing.direction)} assignment on route "${existing.route.name}"`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
        metadata: {
          status: action,
          studentName,
          sessionName: existing.session.name,
          routeName: existing.route.name,
        },
      })
    } else {
      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "TRANSPORT_ASSIGNMENT",
        entityId: id,
        summary: `Updated notes for ${studentName}'s transport assignment`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })
    }

    return row.id
  })

  const updated = await loadAssignment(prisma, updatedId, schoolId)
  if (!updated) throw notFoundError("Assignment not found")
  return toAssignmentListItem(updated)
}