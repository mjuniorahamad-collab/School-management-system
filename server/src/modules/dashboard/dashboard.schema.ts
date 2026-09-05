import { z } from "zod"

export const attendancePeriodSchema = z.enum(["today", "week", "month"])

export const feePeriodSchema = z.enum(["month", "session", "year"])

export const attendanceQuerySchema = z.object({
  period: attendancePeriodSchema.default("today"),
})

export const feesQuerySchema = z.object({
  period: feePeriodSchema.default("session"),
})

export type AttendancePeriod = z.infer<typeof attendancePeriodSchema>
export type FeePeriod = z.infer<typeof feePeriodSchema>
