import { z } from "zod"

export const noticeAudienceSchema = z.enum(["EVERYONE", "STUDENTS", "PARENTS", "TEACHERS", "STAFF"])
export const noticeStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"])
export const noticePrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"])

export const createNoticeSchema = z
  .object({
    title: z.string().trim().min(1, "Notice title is required").max(200),
    body: z.string().trim().min(1, "Notice body is required").max(10_000),
    audience: noticeAudienceSchema.optional(),
    status: noticeStatusSchema.optional(),
    priority: noticePrioritySchema.optional(),
  })
  .strict()

export const updateNoticeSchema = z
  .object({
    title: z.string().trim().min(1, "Notice title is required").max(200).optional(),
    body: z.string().trim().min(1, "Notice body is required").max(10_000).optional(),
    audience: noticeAudienceSchema.optional(),
    status: noticeStatusSchema.optional(),
    priority: noticePrioritySchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" })

export const listNoticesQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: noticeStatusSchema.optional(),
  audience: noticeAudienceSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>
export type ListNoticesQuery = z.infer<typeof listNoticesQuerySchema>
