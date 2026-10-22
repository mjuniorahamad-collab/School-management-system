// Database-free tests for the central Prisma error mapping
// (server/src/lib/prisma-errors.ts).
//
// The mapping turns Prisma's known-request errors into the API error envelope:
//   - P2003 (foreign-key constraint failed) -> 409 DEPENDENCY_CONFLICT
//   - P2025 (the targeted record does not exist) -> 404 NOT_FOUND
// Everything else is left alone so the error handler keeps its generic 500
// behaviour. The messages must never leak the constraint name, table, column
// or SQL.

import { Prisma } from "@prisma/client"
import { describe, expect, it } from "vitest"
import { ApiError, DEPENDENCY_CONFLICT, NOT_FOUND } from "../src/lib/ApiError.js"
import { prismaErrorCode, toPrismaApiError } from "../src/lib/prisma-errors.js"

function knownError(code: string, meta?: Record<string, unknown>): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Prisma known request error", {
    code,
    clientVersion: "6.19.3",
    meta,
  })
}

describe("prismaErrorCode", () => {
  it("reads the code from a real Prisma known-request error", () => {
    expect(prismaErrorCode(knownError("P2003"))).toBe("P2003")
    expect(prismaErrorCode(knownError("P2025"))).toBe("P2025")
  })

  it("falls back to the structural shape for a duplicated Prisma runtime", () => {
    const foreign = { name: "PrismaClientKnownRequestError", code: "P2003" }
    expect(prismaErrorCode(foreign)).toBe("P2003")
  })

  it("returns null for a non-Prisma error", () => {
    expect(prismaErrorCode(new Error("boom"))).toBeNull()
    expect(prismaErrorCode({ name: "PrismaClientKnownRequestError" })).toBeNull()
    expect(prismaErrorCode(null)).toBeNull()
    expect(prismaErrorCode(undefined)).toBeNull()
    expect(prismaErrorCode("P2003")).toBeNull()
  })
})

describe("toPrismaApiError", () => {
  it("maps a foreign-key constraint failure to a 409 DEPENDENCY_CONFLICT", () => {
    const mapped = toPrismaApiError(knownError("P2003", { field_name: "FeeStructureItem_feeHeadId_fkey" }))
    expect(mapped).toBeInstanceOf(ApiError)
    expect(mapped!.statusCode).toBe(409)
    expect(mapped!.code).toBe(DEPENDENCY_CONFLICT)
  })

  it("maps a missing-row update/delete to a 404 NOT_FOUND", () => {
    const mapped = toPrismaApiError(knownError("P2025", { modelName: "GradingBand" }))
    expect(mapped).toBeInstanceOf(ApiError)
    expect(mapped!.statusCode).toBe(404)
    expect(mapped!.code).toBe(NOT_FOUND)
  })

  it("never leaks the constraint name, table, column or SQL to the client", () => {
    const mapped = toPrismaApiError(
      knownError("P2003", {
        field_name: "FeeStructureItem_feeHeadId_fkey",
        table_name: "FeeStructureItem",
        constraint: "FeeStructureItem_feeHeadId_fkey",
      }),
    )
    expect(mapped!.message).not.toMatch(/FeeStructureItem/)
    expect(mapped!.message).not.toMatch(/feeHeadId/)
    expect(mapped!.message).not.toMatch(/fkey/i)
    expect(mapped!.message).not.toMatch(/constraint/i)
  })

  it("leaves unmapped Prisma codes to the caller", () => {
    expect(toPrismaApiError(knownError("P2002"))).toBeNull()
    expect(toPrismaApiError(knownError("P2000"))).toBeNull()
  })

  it("leaves non-Prisma errors to the caller", () => {
    expect(toPrismaApiError(new Error("boom"))).toBeNull()
    expect(toPrismaApiError(null)).toBeNull()
  })
})
