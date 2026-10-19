import { z } from "zod"

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
const registerStatusEnum = z.enum(["OPEN", "SUBMITTED", "VERIFIED"])

export const openRegisterSchema = z
  .object({
    academicSessionId: z.string().uuid(),
    classId: z.string().uuid(),
    sectionId: z.string().uuid().nullable().optional(),
    date: dateString,
  })
  .strict()

export const listRegistersQuerySchema = z.object({
  academicSessionId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  sectionId: z.string().uuid().optional(),
  status: registerStatusEnum.optional(),
  dateFrom: dateString.optional(),
  dateTo: dateString.optional(),
})

export type OpenRegisterInput = z.infer<typeof openRegisterSchema>
export type ListRegistersQuery = z.infer<typeof listRegistersQuerySchema>
