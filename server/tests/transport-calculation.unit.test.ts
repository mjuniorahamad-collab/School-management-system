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
import type { TransportDirection } from "@prisma/client"
import { createRng } from "./helpers/seeded-random.js"

// Independent calculation-verification suite for the pure transport rules.
// NOTE: transport.rules.ts contains no monetary fee function — transport
// charges flow through Fee Structures (covered by the fee suites). This file
// verifies the transport calculations that do exist: seat capacity, trip
// counts, and stop ordering. Complements transport.unit.test.ts with boundary
// and property coverage.

describe("isAtCapacity (calculation)", () => {
  it("reports below capacity as not full", () => {
    expect(isAtCapacity(39, 40)).toBe(false)
  })

  it("treats the capacity itself as full (hard ceiling)", () => {
    expect(isAtCapacity(40, 40)).toBe(true)
  })

  it("reports over capacity as full", () => {
    expect(isAtCapacity(41, 40)).toBe(true)
  })

  it("treats a zero-capacity vehicle as full", () => {
    expect(isAtCapacity(0, 0)).toBe(true)
  })

  it("reports an empty vehicle with room as not full", () => {
    expect(isAtCapacity(0, 1)).toBe(false)
  })

  it("rejects a negative active count", () => {
    expect(() => isAtCapacity(-1, 40)).toThrow(RangeError)
    expect(() => isAtCapacity(-1, 40)).toThrow(/non-negative/)
  })

  it("rejects a negative capacity", () => {
    expect(() => isAtCapacity(0, -1)).toThrow(/non-negative/)
  })

  it("rejects non-finite capacity inputs", () => {
    expect(() => isAtCapacity(Number.NaN, 40)).toThrow(/finite/)
    expect(() => isAtCapacity(1, Number.POSITIVE_INFINITY)).toThrow(/finite/)
  })
})

describe("remainingSeats (calculation)", () => {
  it("subtracts the active count from capacity", () => {
    expect(remainingSeats(30, 40)).toBe(10)
  })

  it("returns 0 at capacity", () => {
    expect(remainingSeats(40, 40)).toBe(0)
  })

  it("clamps to 0 when over capacity", () => {
    expect(remainingSeats(45, 40)).toBe(0)
  })

  it("returns 0 for a zero-capacity vehicle", () => {
    expect(remainingSeats(0, 0)).toBe(0)
  })

  it("rejects a negative active count instead of reporting extra seats", () => {
    // FIXED: a negative active count would otherwise report MORE seats than the
    // capacity. Inputs are validated, so it throws rather than clamping.
    expect(() => remainingSeats(-1, 40)).toThrow(RangeError)
    expect(() => remainingSeats(-1, 40)).toThrow(/non-negative/)
  })

  it("rejects a negative capacity", () => {
    expect(() => remainingSeats(0, -1)).toThrow(/non-negative/)
  })

  it("rejects non-finite capacity inputs", () => {
    expect(() => remainingSeats(Number.NaN, 40)).toThrow(/finite/)
    expect(() => remainingSeats(1, Number.NaN)).toThrow(/finite/)
  })
})

describe("directionContribution (calculation)", () => {
  it("counts TO_SCHOOL on the morning trip only", () => {
    expect(directionContribution("TO_SCHOOL")).toEqual({ morning: 1, afternoon: 0 })
  })

  it("counts FROM_SCHOOL on the afternoon trip only", () => {
    expect(directionContribution("FROM_SCHOOL")).toEqual({ morning: 0, afternoon: 1 })
  })

  it("counts BOTH on each trip", () => {
    expect(directionContribution("BOTH")).toEqual({ morning: 1, afternoon: 1 })
  })
})

describe("tripPeak (calculation)", () => {
  it("peaks at the busier single trip", () => {
    expect(tripPeak({ morning: 1, afternoon: 0 })).toBe(1)
  })

  it("returns 0 for an empty bus", () => {
    expect(tripPeak({ morning: 0, afternoon: 0 })).toBe(0)
  })

  it("returns the shared count when both trips match", () => {
    expect(tripPeak({ morning: 30, afternoon: 30 })).toBe(30)
  })

  it("picks the afternoon when it is busier", () => {
    expect(tripPeak({ morning: 5, afternoon: 30 })).toBe(30)
  })
})

describe("computeStopOrder (calculation)", () => {
  const ids = ["a", "b", "c", "d"]

  it("moves a stop to the front", () => {
    expect(computeStopOrder(ids, "d", 0)).toEqual(["d", "a", "b", "c"])
  })

  it("moves a stop to the back", () => {
    expect(computeStopOrder(ids, "a", 3)).toEqual(["b", "c", "d", "a"])
  })

  it("returns the original reference when nothing moves", () => {
    const src = ["a", "b"]
    expect(computeStopOrder(src, "a", 0)).toBe(src)
  })

  it("clamps a target index above the end", () => {
    expect(computeStopOrder(ids, "c", 99)).toEqual(["a", "b", "d", "c"])
  })

  it("clamps a negative target index to the front", () => {
    expect(computeStopOrder(ids, "c", -5)).toEqual(["c", "a", "b", "d"])
  })

  it("returns the original reference for an unknown id", () => {
    const src = ["a", "b"]
    expect(computeStopOrder(src, "zzz", 1)).toBe(src)
  })

  it("returns the original reference for a single-element list", () => {
    const src = ["a"]
    expect(computeStopOrder(src, "a", 0)).toBe(src)
  })

  it("swaps two elements", () => {
    expect(computeStopOrder(["a", "b"], "b", 0)).toEqual(["b", "a"])
  })
})

describe("identifier / name helpers (calculation)", () => {
  it("zero-pads the vehicle code to four digits", () => {
    expect(buildTransportVehicleCode(0)).toBe("VEH-0000")
    expect(buildTransportVehicleCode(1)).toBe("VEH-0001")
    expect(buildTransportVehicleCode(42)).toBe("VEH-0042")
  })

  it("passes through vehicle sequences longer than four digits", () => {
    expect(buildTransportVehicleCode(1000)).toBe("VEH-1000")
  })

  it("normalizes a registration number", () => {
    expect(normalizeRegistrationNumber("  kca 123 a ")).toBe("KCA123A")
  })

  it("joins names and drops empty parts", () => {
    expect(joinName("Ada", "May", "Lovelace")).toBe("Ada May Lovelace")
    expect(joinName("Ada", null, null)).toBe("Ada")
    expect(joinName("Ada", "", "")).toBe("Ada")
  })

  it("returns an empty string when every name part is absent", () => {
    expect(joinName("", null, null)).toBe("")
  })

  it("normalizes only recognized assignment statuses", () => {
    expect(normalizeAssignmentStatus("ACTIVE")).toBe("ACTIVE")
    expect(normalizeAssignmentStatus("INACTIVE")).toBe("INACTIVE")
    expect(normalizeAssignmentStatus("NOPE")).toBeUndefined()
    expect(normalizeAssignmentStatus(undefined)).toBeUndefined()
  })
})

describe("transport seating invariants (property, seeded)", () => {
  const rng = createRng(20260907)
  const directions: TransportDirection[] = ["TO_SCHOOL", "FROM_SCHOOL", "BOTH"]

  it("sums direction contributions and caps at the trip peak", () => {
    for (let i = 0; i < 500; i += 1) {
      const count = rng.int(0, 40)
      let morning = 0
      let afternoon = 0
      for (let j = 0; j < count; j += 1) {
        const contribution = directionContribution(rng.pick(directions))
        morning += contribution.morning
        afternoon += contribution.afternoon
      }
      const capacity = rng.int(0, 50)
      const peak = tripPeak({ morning, afternoon })
      expect(peak).toBe(Math.max(morning, afternoon))
      expect(peak).toBeGreaterThanOrEqual(morning)
      expect(peak).toBeGreaterThanOrEqual(afternoon)
      expect(isAtCapacity(peak, capacity)).toBe(peak >= capacity)
      expect(remainingSeats(peak, capacity)).toBe(Math.max(0, capacity - peak))
    }
  })
})
