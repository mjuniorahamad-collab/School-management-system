import { z } from "zod"
import {
  TransportAssignmentStatus,
  TransportDirection,
  TransportVehicleType,
} from "@prisma/client"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

/** Optional id that accepts both "" (no change) and null (explicit clear). */
function nullableId() {
  return z.union([z.null(), emptyToUndefined, idSchema]).optional()
}

function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  )
}

const vehicleTypeSchema = z.nativeEnum(TransportVehicleType)
const directionSchema = z.nativeEnum(TransportDirection)
const assignmentStatusSchema = z.nativeEnum(TransportAssignmentStatus)
const idSchema = z.string().trim().min(1).max(64)

function optionalId() {
  return optionalParam(idSchema)
}

// ────────────────────────────────────────────────────────────────────────────
// Vehicles
// ────────────────────────────────────────────────────────────────────────────

export const createVehicleSchema = z
  .object({
    registrationNumber: z.string().trim().min(1, "Registration number is required").max(50),
    type: vehicleTypeSchema.optional(),
    make: optionalText(100),
    model: optionalText(100),
    year: optionalParam(z.coerce.number().int().min(1950).max(2100)),
    capacity: z.coerce.number().int().min(1, "Capacity must be at least 1").max(1000),
    isActive: z.boolean().optional(),
    notes: optionalText(500),
  })
  .strict()

export const updateVehicleSchema = createVehicleSchema.partial().strict()

export const listVehiclesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  type: optionalParam(vehicleTypeSchema),
  isActive: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["registrationNumber", "vehicleCode", "capacity", "updatedAt"]).optional().default("updatedAt"),
  sortDir: z.enum(["asc", "desc"]).optional().default("desc"),
})

// ────────────────────────────────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────────────────────────────────

export const createRouteSchema = z
  .object({
    name: z.string().trim().min(1, "Route name is required").max(150),
    code: optionalText(50),
    vehicleId: optionalId(),
    description: optionalText(500),
    isActive: z.boolean().optional(),
  })
  .strict()

export const updateRouteSchema = z
  .object({
    name: optionalText(150),
    code: optionalText(50),
    vehicleId: nullableId(),
    description: optionalText(500),
    isActive: z.boolean().optional(),
  })
  .strict()

export const listRoutesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  isActive: z.enum(["true", "false"]).optional(),
})

// ────────────────────────────────────────────────────────────────────────────
// Stops
// ────────────────────────────────────────────────────────────────────────────

export const createStopSchema = z
  .object({
    name: z.string().trim().min(1, "Stop name is required").max(150),
  })
  .strict()

export const updateStopSchema = z
  .object({
    name: optionalText(150),
    sortOrder: optionalParam(z.coerce.number().int().min(0).max(1000)),
    isActive: z.boolean().optional(),
  })
  .strict()

export const listStopsQuerySchema = z.object({
  routeId: optionalId(),
})

// ────────────────────────────────────────────────────────────────────────────
// Drivers
// ────────────────────────────────────────────────────────────────────────────

export const createDriverSchema = z
  .object({
    staffId: idSchema,
    routeId: optionalId(),
    userId: optionalId(),
    roleLabel: optionalText(100),
  })
  .strict()

export const updateDriverSchema = z
  .object({
    staffId: optionalId(),
    routeId: nullableId(),
    userId: nullableId(),
    roleLabel: optionalText(100),
    isActive: z.boolean().optional(),
  })
  .strict()

export const listDriversQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  routeId: optionalId(),
  isActive: z.enum(["true", "false"]).optional(),
})

// ────────────────────────────────────────────────────────────────────────────
// Assignments
// ────────────────────────────────────────────────────────────────────────────

export const createAssignmentSchema = z
  .object({
    studentId: idSchema,
    academicSessionId: idSchema,
    routeId: idSchema,
    stopId: idSchema,
    direction: directionSchema,
    notes: optionalText(500),
  })
  .strict()

export const updateAssignmentSchema = z
  .object({
    status: assignmentStatusSchema.optional(),
    notes: optionalText(500),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.status === undefined && data.notes === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Provide a status change or new notes",
      })
    }
  })

export const listAssignmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  routeId: optionalId(),
  studentId: optionalId(),
  academicSessionId: optionalId(),
  direction: optionalParam(directionSchema),
  status: optionalParam(assignmentStatusSchema),
})

export const listAssignmentContextQuerySchema = z.object({
  studentSearch: optionalParam(z.string().trim().min(1).max(100)),
})

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>
export type CreateRouteInput = z.infer<typeof createRouteSchema>
export type UpdateRouteInput = z.infer<typeof updateRouteSchema>
export type ListRoutesQuery = z.infer<typeof listRoutesQuerySchema>
export type CreateStopInput = z.infer<typeof createStopSchema>
export type UpdateStopInput = z.infer<typeof updateStopSchema>
export type ListStopsQuery = z.infer<typeof listStopsQuerySchema>
export type CreateDriverInput = z.infer<typeof createDriverSchema>
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>
export type ListDriversQuery = z.infer<typeof listDriversQuerySchema>
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>
export type ListAssignmentsQuery = z.infer<typeof listAssignmentsQuerySchema>
export type ListAssignmentContextQuery = z.infer<typeof listAssignmentContextQuerySchema>