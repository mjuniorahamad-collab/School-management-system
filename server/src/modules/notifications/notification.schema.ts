import { z } from "zod"
import { MAX_RECIPIENT_IDS, MAX_ROLE_TARGETS, NOTIFICATION_BODY_MAX, NOTIFICATION_LINK_MAX, NOTIFICATION_TITLE_MAX } from "./notification.rules.js"

export const notificationTypeSchema = z.enum(["FEE_INVOICE", "FEE_PAYMENT", "PORTAL_LINK", "ADMIN"])

/**
 * Manual send schema. `type` is locked to ADMIN: manual notifications are
 * generic school announcements, while the other types are produced only by the
 * automatic event triggers (fee invoice, payment, portal link).
 */
export const createNotificationSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(NOTIFICATION_TITLE_MAX),
    body: z.string().trim().max(NOTIFICATION_BODY_MAX).optional(),
    type: z.literal("ADMIN"),
    linkPath: z
      .string()
      .trim()
      .min(1)
      .max(NOTIFICATION_LINK_MAX)
      .regex(/^\//, "Link must start with a slash")
      .optional(),
    recipientIds: z.array(z.string().min(1)).max(MAX_RECIPIENT_IDS).optional(),
    roleNames: z.array(z.string().trim().min(1).max(64)).max(MAX_ROLE_TARGETS).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasTargets = (value.recipientIds?.length ?? 0) > 0 || (value.roleNames?.length ?? 0) > 0
    if (!hasTargets) {
      ctx.addIssue({
        code: "custom",
        path: ["recipientIds"],
        message: "A notification needs at least one recipient or role target",
      })
    }
  })

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: notificationTypeSchema.optional(),
  filter: z.enum(["all", "unread"]).default("all"),
})

export type NotificationTypeInput = z.infer<typeof notificationTypeSchema>
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>