import { z } from "zod"

export const conversationTypeSchema = z.enum(["DIRECT", "GROUP"])

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Message body is required")
  .max(4000, "Message body must be at most 4000 characters")

export const sendMessageSchema = z
  .object({
    body: messageBodySchema,
  })
  .strict()

export const createConversationSchema = z
  .object({
    type: conversationTypeSchema,
    title: z.string().trim().min(1, "Group title is required").max(120).optional(),
    recipientIds: z.array(z.string().min(1)).max(49).optional(),
    roleNames: z.array(z.string().trim().min(1).max(64)).max(8).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.type === "DIRECT") {
      if (!value.recipientIds || value.recipientIds.length === 0) {
        ctx.addIssue({ code: "custom", path: ["recipientIds"], message: "A direct conversation needs exactly one recipient" })
      }
      if (value.recipientIds && value.recipientIds.length > 1) {
        ctx.addIssue({ code: "custom", path: ["recipientIds"], message: "A direct conversation has exactly one recipient" })
      }
      if (value.title) {
        ctx.addIssue({ code: "custom", path: ["title"], message: "Direct conversations do not take a title" })
      }
      if (value.roleNames && value.roleNames.length > 0) {
        ctx.addIssue({ code: "custom", path: ["roleNames"], message: "Direct conversations do not take role targets" })
      }
    } else {
      if (!value.title) {
        ctx.addIssue({ code: "custom", path: ["title"], message: "A group conversation needs a title" })
      }
      const hasTargets = (value.recipientIds?.length ?? 0) > 0 || (value.roleNames?.length ?? 0) > 0
      if (!hasTargets) {
        ctx.addIssue({
          code: "custom",
          path: ["recipientIds"],
          message: "A group conversation needs at least one recipient or role target",
        })
      }
    }
  })

export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const listMessagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  before: z.string().datetime({ offset: true }).optional(),
})

export const addParticipantsSchema = z
  .object({
    recipientIds: z.array(z.string().min(1)).max(49).optional(),
    roleNames: z.array(z.string().trim().min(1).max(64)).max(8).optional(),
  })
  .strict()
  .refine(
    (value) => (value.recipientIds?.length ?? 0) > 0 || (value.roleNames?.length ?? 0) > 0,
    { message: "Provide at least one recipient or role target" },
  )

const roleNamesListSchema = z
  .union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split(",")))
  .pipe(z.array(z.string().trim().min(1).max(64)).max(8))

export const listRecipientsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  roleNames: roleNamesListSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})

export type MessageConversationTypeInput = z.infer<typeof conversationTypeSchema>
export type CreateConversationInput = z.infer<typeof createConversationSchema>
export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>
export type AddParticipantsInput = z.infer<typeof addParticipantsSchema>
export type ListRecipientsQuery = z.infer<typeof listRecipientsQuerySchema>