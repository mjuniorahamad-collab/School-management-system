import { z } from "zod"

export const eventCategorySchema = z.enum(["GENERAL", "ACADEMIC", "SPORTS", "CULTURAL", "COMMUNITY"])
export const eventStatusSchema = z.enum(["SCHEDULED", "ONGOING", "COMPLETED", "CANCELLED"])

export const createEventSchema = z
  .object({
    title: z.string().trim().min(1, "Event title is required").max(200),
    description: z.string().trim().max(5_000).optional(),
    category: eventCategorySchema.optional(),
    status: eventStatusSchema.optional(),
    startAt: z.iso.datetime({ offset: true, message: "Enter a valid start date and time" }),
    endAt: z.iso.datetime({ offset: true, message: "Enter a valid end date and time" }),
    location: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((value) => new Date(value.startAt) < new Date(value.endAt), {
    path: ["endAt"],
    message: "End date and time must be after the start",
  })

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1, "Event title is required").max(200).optional(),
    description: z.string().trim().max(5_000).optional(),
    category: eventCategorySchema.optional(),
    status: eventStatusSchema.optional(),
    startAt: z.iso.datetime({ offset: true, message: "Enter a valid start date and time" }).optional(),
    endAt: z.iso.datetime({ offset: true, message: "Enter a valid end date and time" }).optional(),
    location: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "Provide at least one field to update" })
  .refine(
    (value) =>
      value.startAt === undefined ||
      value.endAt === undefined ||
      new Date(value.startAt) < new Date(value.endAt),
    { path: ["endAt"], message: "End date and time must be after the start" },
  )

export const listEventsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  category: eventCategorySchema.optional(),
  status: eventStatusSchema.optional(),
  from: z.iso.date({ message: "Enter a valid from date (YYYY-MM-DD)" }).optional(),
  to: z.iso.date({ message: "Enter a valid to date (YYYY-MM-DD)" }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>
