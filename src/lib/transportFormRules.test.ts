import { describe, expect, it } from "vitest"
import {
  assignmentFormToPayload,
  defaultAssignmentForm,
  defaultDriverForm,
  defaultRouteForm,
  defaultStopForm,
  defaultVehicleForm,
  directionContribution,
  driverFormToPayload,
  normalizeRegistrationNumber,
  routeFormToPayload,
  seatsRemainingOnRoute,
  stopFormToPayload,
  tripPeak,
  validateAssignmentForm,
  validateDriverForm,
  validateRouteForm,
  validateStopForm,
  validateVehicleForm,
  vehicleFormToPayload,
} from "./transportFormRules"

describe("transportFormRules", () => {
  describe("normalization and seat math", () => {
    it("normalizes registration numbers like the backend", () => {
      expect(normalizeRegistrationNumber("kca 123 a")).toBe("KCA123A")
      expect(normalizeRegistrationNumber("  KCA-5  25B ")).toBe("KCA-525B")
    })

    it("per-trip contribution matches the backend semantics", () => {
      expect(directionContribution("TO_SCHOOL")).toEqual({ morning: 1, afternoon: 0 })
      expect(directionContribution("FROM_SCHOOL")).toEqual({ morning: 0, afternoon: 1 })
      expect(directionContribution("BOTH")).toEqual({ morning: 1, afternoon: 1 })
    })

    it("computes the busiest-trip peak and remaining seats", () => {
      expect(tripPeak(directionContribution("BOTH"))).toBe(1)
      const counts = { morning: 12, afternoon: 15 }
      expect(seatsRemainingOnRoute(20, counts)).toBe(5)
      expect(seatsRemainingOnRoute(12, counts)).toBe(0)
    })
  })

  describe("vehicle form", () => {
    it("rejects missing registration and capacity", () => {
      const errors = validateVehicleForm(defaultVehicleForm())
      expect(errors.some((error) => error.field === "registrationNumber")).toBe(true)
      expect(errors.some((error) => error.field === "capacity")).toBe(true)
    })

    it("accepts a complete vehicle", () => {
      const form = { ...defaultVehicleForm(), registrationNumber: "kca 123 a", capacity: "40" }
      expect(validateVehicleForm(form)).toEqual([])
    })

    it("rejects out-of-range capacity and year", () => {
      const badCapacity = { ...defaultVehicleForm(), registrationNumber: "KCA123A", capacity: "0" }
      expect(validateVehicleForm(badCapacity).some((error) => error.field === "capacity")).toBe(true)
      const badYear = {
        ...defaultVehicleForm(),
        registrationNumber: "KCA123A",
        capacity: "40",
        year: "1949",
      }
      expect(validateVehicleForm(badYear).some((error) => error.field === "year")).toBe(true)
    })

    it("normalizes the registration and coerces numeric fields", () => {
      const payload = vehicleFormToPayload({
        ...defaultVehicleForm(),
        registrationNumber: " kca 123 a ",
        capacity: "40",
        year: "2022",
        make: "  Toyota  ",
      })
      expect(payload).toEqual({
        registrationNumber: "KCA123A",
        capacity: 40,
        type: "OTHER",
        isActive: true,
        year: 2022,
        make: "Toyota",
      })
    })
  })

  describe("route form", () => {
    it("rejects a missing name and accepts a full route", () => {
      expect(validateRouteForm(defaultRouteForm()).some((error) => error.field === "name")).toBe(true)
      const form = { ...defaultRouteForm(), name: "Kampala Rd", code: "R1", vehicleId: "vh-1" }
      expect(validateRouteForm(form)).toEqual([])
    })

    it("omits empty optional fields from the payload", () => {
      const payload = routeFormToPayload({ ...defaultRouteForm(), name: "  Jinja Rd  " })
      expect(payload).toEqual({ name: "Jinja Rd", isActive: true })
    })
  })

  describe("stop form", () => {
    it("rejects a missing name", () => {
      expect(validateStopForm(defaultStopForm()).some((error) => error.field === "name")).toBe(true)
    })

    it("accepts and trims a stop name", () => {
      expect(validateStopForm({ name: "Ntinda" })).toEqual([])
      expect(stopFormToPayload({ name: "  Ntinda  " })).toEqual({ name: "Ntinda" })
    })
  })

  describe("driver form", () => {
    it("requires a staff member", () => {
      expect(validateDriverForm(defaultDriverForm()).some((error) => error.field === "staffId")).toBe(true)
      expect(validateDriverForm({ ...defaultDriverForm(), staffId: "st-1" }).some((error) => error.field === "staffId")).toBe(false)
    })

    it("defaults the role label and omits an empty route", () => {
      const payload = driverFormToPayload({ ...defaultDriverForm(), staffId: "st-1" })
      expect(payload).toEqual({ staffId: "st-1", roleLabel: "Driver" })
    })
  })

  describe("assignment form", () => {
    it("requires student, session, route and stop", () => {
      const errors = validateAssignmentForm(defaultAssignmentForm())
      expect(errors.some((error) => error.field === "studentId")).toBe(true)
      expect(errors.some((error) => error.field === "academicSessionId")).toBe(true)
      expect(errors.some((error) => error.field === "routeId")).toBe(true)
      expect(errors.some((error) => error.field === "stopId")).toBe(true)
    })

    it("accepts a valid assignment and omits empty notes", () => {
      const form = {
        ...defaultAssignmentForm(),
        studentId: "stu-1",
        academicSessionId: "sess-1",
        routeId: "rt-1",
        stopId: "sp-1",
        direction: "BOTH",
      } as const
      expect(validateAssignmentForm(form)).toEqual([])
      const payload = assignmentFormToPayload(form)
      expect(payload).toEqual({
        studentId: "stu-1",
        academicSessionId: "sess-1",
        routeId: "rt-1",
        stopId: "sp-1",
        direction: "BOTH",
      })
      expect(payload).not.toHaveProperty("notes")
    })
  })
})