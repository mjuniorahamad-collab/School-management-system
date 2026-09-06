import { describe, expect, it } from "vitest"
import {
  buildTransportVehicleCode,
  computeStopOrder,
  directionContribution,
  isAtCapacity,
  joinName,
  normalizeAssignmentStatus,
  normalizeRegistrationNumber,
  remainingSeats,
  tripPeak,
} from "../src/modules/transport/transport.rules.js"
import {
  toAssignmentListItem,
  toDriverListItem,
  toRouteDetail,
  toRouteListItem,
  toStopDetail,
  toVehicleListItem,
} from "../src/modules/transport/transport.mapper.js"

describe("transport rules", () => {
  describe("buildTransportVehicleCode", () => {
    it("zero-pads the sequence to four digits with the VEH prefix", () => {
      expect(buildTransportVehicleCode(1)).toBe("VEH-0001")
      expect(buildTransportVehicleCode(42)).toBe("VEH-0042")
      expect(buildTransportVehicleCode(999)).toBe("VEH-0999")
    })

    it("passes through larger sequences without truncating", () => {
      expect(buildTransportVehicleCode(1000)).toBe("VEH-1000")
      expect(buildTransportVehicleCode(12345)).toBe("VEH-12345")
    })
  })

  describe("normalizeRegistrationNumber", () => {
    it("trims, uppercases and removes interior whitespace", () => {
      expect(normalizeRegistrationNumber("  kca 123 a ")).toBe("KCA123A")
      expect(normalizeRegistrationNumber("KCA-123A")).toBe("KCA-123A")
    })
  })

  describe("joinName", () => {
    it("joins first, middle and last names, dropping empty parts", () => {
      expect(joinName("Ada", "May", "Lovelace")).toBe("Ada May Lovelace")
      expect(joinName("Ada", null, "Lovelace")).toBe("Ada Lovelace")
      expect(joinName("Ada", "", "")).toBe("Ada")
    })
  })

  describe("capacity helpers", () => {
    it("treats capacity as a hard ceiling", () => {
      expect(isAtCapacity(39, 40)).toBe(false)
      expect(isAtCapacity(40, 40)).toBe(true)
      expect(remainingSeats(30, 40)).toBe(10)
      expect(remainingSeats(45, 40)).toBe(0)
    })
  })

  describe("trip-based seating", () => {
    it("counts TO_SCHOOL on the morning trip only", () => {
      expect(directionContribution("TO_SCHOOL")).toEqual({ morning: 1, afternoon: 0 })
    })

    it("counts FROM_SCHOOL on the afternoon trip only", () => {
      expect(directionContribution("FROM_SCHOOL")).toEqual({ morning: 0, afternoon: 1 })
    })

    it("counts BOTH as one seat on each trip", () => {
      expect(directionContribution("BOTH")).toEqual({ morning: 1, afternoon: 1 })
    })

    it("peaks at the busier trip", () => {
      expect(tripPeak({ morning: 1, afternoon: 0 })).toBe(1)
      expect(tripPeak({ morning: 30, afternoon: 30 })).toBe(30)
      expect(tripPeak({ morning: 0, afternoon: 0 })).toBe(0)
    })
  })

  describe("computeStopOrder", () => {
    const ids = ["a", "b", "c", "d"]

    it("moves a stop to the front", () => {
      expect(computeStopOrder(ids, "d", 0)).toEqual(["d", "a", "b", "c"])
    })

    it("moves a stop to the back", () => {
      expect(computeStopOrder(ids, "a", 3)).toEqual(["b", "c", "d", "a"])
    })

    it("returns the original order when nothing moves", () => {
      const src = ["a", "b"]
      expect(computeStopOrder(src, "a", 0)).toBe(src)
    })

    it("clamps out-of-range target indexes", () => {
      expect(computeStopOrder(ids, "c", 99)).toEqual(["a", "b", "d", "c"])
      expect(computeStopOrder(ids, "c", -5)).toEqual(["c", "a", "b", "d"])
    })

    it("returns the original list for an unknown id", () => {
      const src = ["a", "b"]
      expect(computeStopOrder(src, "zzz", 1)).toBe(src)
    })
  })

  describe("normalizeAssignmentStatus", () => {
    it("only returns valid statuses", () => {
      expect(normalizeAssignmentStatus("ACTIVE")).toBe("ACTIVE")
      expect(normalizeAssignmentStatus("INACTIVE")).toBe("INACTIVE")
      expect(normalizeAssignmentStatus("NOPE")).toBeUndefined()
      expect(normalizeAssignmentStatus(undefined)).toBeUndefined()
    })
  })
})

describe("transport mappers", () => {
  it("maps a vehicle list item with route and seat info", () => {
    const item = toVehicleListItem(
      {
        id: "vehicle-1",
        registrationNumber: "KCA-123A",
        vehicleCode: "VEH-0001",
        type: "BUS",
        make: "Toyota",
        model: "Coaster",
        year: 2020,
        capacity: 40,
        isActive: true,
        notes: null,
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-02T00:00:00.000Z"),
      },
      { routeName: "Route A", seatsUsed: 22 },
    )
    expect(item.registrationNumber).toBe("KCA-123A")
    expect(item.vehicleCode).toBe("VEH-0001")
    expect(item.routeName).toBe("Route A")
    expect(item.seatsUsed).toBe(22)
    expect(item.createdAt).toBe("2026-09-01T00:00:00.000Z")
  })

  it("maps a route list item with vehicle, counts and seats", () => {
    const item = toRouteListItem(
      {
        id: "route-1",
        name: "Route A",
        code: "R-A",
        description: null,
        isActive: true,
        vehicle: { id: "v1", registrationNumber: "KCA-1", capacity: 40, isActive: true },
        _count: { stops: 3, drivers: 1 },
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      14,
    )
    expect(item.vehicleRegistration).toBe("KCA-1")
    expect(item.vehicleCapacity).toBe(40)
    expect(item.stopCount).toBe(3)
    expect(item.driverCount).toBe(1)
    expect(item.seatsUsed).toBe(14)
  })

  it("maps a route detail with ordered stops", () => {
    const item = toRouteDetail(
      {
        id: "route-1",
        name: "Route A",
        code: null,
        description: "Long",
        isActive: true,
        vehicle: null,
        stops: [
          {
            id: "stop-2",
            routeId: "route-1",
            name: "Stop B",
            sortOrder: 2,
            isActive: true,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
          {
            id: "stop-1",
            routeId: "route-1",
            name: "Stop A",
            sortOrder: 1,
            isActive: true,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-01T00:00:00.000Z"),
          },
        ],
        _count: { drivers: 0 },
        createdAt: new Date("2026-09-01T00:00:00.000Z"),
        updatedAt: new Date("2026-09-01T00:00:00.000Z"),
      },
      9,
    )
    expect(item.stops).toHaveLength(2)
    expect(item.stops[0].name).toBe("Stop B")
    expect(item.seatsUsed).toBe(9)
    expect(item.vehicleId).toBeNull()
  })

  it("maps a stop detail", () => {
    const item = toStopDetail({
      id: "stop-1",
      routeId: "route-1",
      name: "Library Gate",
      sortOrder: 1,
      isActive: true,
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    })
    expect(item.name).toBe("Library Gate")
    expect(item.sortOrder).toBe(1)
  })

  it("maps a driver list item joining the staff name", () => {
    const item = toDriverListItem({
      id: "driver-1",
      roleLabel: "Driver",
      isActive: true,
      staffId: "staff-1",
      staff: {
        id: "staff-1",
        firstName: "James",
        middleName: null,
        lastName: "Mwangi",
        employeeId: "EMP-001",
      },
      userId: null,
      routeId: "route-1",
      route: { id: "route-1", name: "Route A", isActive: true },
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    })
    expect(item.staffName).toBe("James Mwangi")
    expect(item.employeeId).toBe("EMP-001")
    expect(item.routeName).toBe("Route A")
  })

  it("maps an assignment list item with nested references", () => {
    const item = toAssignmentListItem({
      id: "assignment-1",
      schoolId: "school-1",
      studentId: "student-1",
      student: {
        id: "student-1",
        firstName: "Zara",
        middleName: null,
        lastName: "Kimani",
        admissionNumber: "ADM-0001",
      },
      academicSessionId: "session-1",
      session: { id: "session-1", name: "2026 Term 1", code: "T1-2026", status: "ACTIVE" },
      routeId: "route-1",
      route: {
        id: "route-1",
        name: "Route A",
        isActive: true,
        vehicle: { id: "v1", registrationNumber: "KCA-1", capacity: 40, isActive: true },
      },
      stopId: "stop-1",
      stop: { id: "stop-1", name: "Main Gate", isActive: true },
      direction: "BOTH",
      status: "ACTIVE",
      assignedAt: new Date("2026-09-01T00:00:00.000Z"),
      deactivatedAt: null,
      notes: "Pickup at 6am",
      createdAt: new Date("2026-09-01T00:00:00.000Z"),
      updatedAt: new Date("2026-09-01T00:00:00.000Z"),
    })
    expect(item.studentName).toBe("Zara Kimani")
    expect(item.routeName).toBe("Route A")
    expect(item.vehicleRegistration).toBe("KCA-1")
    expect(item.direction).toBe("BOTH")
    expect(item.notes).toBe("Pickup at 6am")
    expect(item.deactivatedAt).toBeNull()
  })
})