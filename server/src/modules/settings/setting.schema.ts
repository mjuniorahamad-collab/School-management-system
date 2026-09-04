import { z } from "zod"

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max)

const optionalText = (max: number) => z.string().trim().max(max).optional()

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4f46e5")
  .optional()

const urlSchema = z
  .string()
  .trim()
  .url("Enter a valid URL")
  .optional()

const flag = z.boolean().optional()

export const schoolSettingsSchema = z.object({
  schoolName: requiredText("School name", 200),
  schoolShortName: optionalText(50),
  tagline: optionalText(200),
  contactPhone: optionalText(30),
  contactEmail: z.string().trim().email("Enter a valid email address").max(200).or(z.literal("")).transform((v) => (v === "" ? undefined : v)).optional(),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
  logoUrl: urlSchema,
  primaryColor: colorSchema,
  academicTermLabel: optionalText(50),
  academicCurrentSession: optionalText(100),
  attendanceWorkdays: optionalText(100),
  attendanceDefaultMarking: z.enum(["daily", "period"]).optional(),
  attendanceLateGraceMinutes: z.number().int().min(0).max(120).optional(),
  timetablePeriodsPerDay: z.number().int().min(1).max(12).optional(),
  timetableStartTime: z.string().trim().max(5).optional(),
  timetableEndTime: z.string().trim().max(5).optional(),
  gradingPassPercent: z.number().int().min(0).max(100).optional(),
  gradingScale: z.enum(["100", "4.0"]).optional(),
  feeCurrency: optionalText(10),
  feeDefaultDueDay: z.number().int().min(1).max(31).optional(),
  feeEnableOnlinePayments: flag,
})

export const updateSettingsSchema = schoolSettingsSchema.partial().strict()

export type SchoolSettings = z.infer<typeof schoolSettingsSchema>
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>
