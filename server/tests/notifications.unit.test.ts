import { describe, expect, it } from "vitest"
import { MAX_RECIPIENT_IDS, MAX_ROLE_TARGETS, dedupeIds } from "../src/modules/notifications/notification.rules.js"
import {
  createNotificationSchema,
  notificationTypeSchema,
} from "../src/modules/notifications/notification.schema.js"

describe("notification rules", () => {
  it("deduplicates ids preserving first-seen order", () => {
    expect(dedupeIds(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"])
    expect(dedupeIds([])).toEqual([])
  })

  it("caps recipient and role targets", () => {
    expect(MAX_RECIPIENT_IDS).toBe(200)
    expect(MAX_ROLE_TARGETS).toBe(5)
  })

  it("accepts only the four notification types", () => {
    const parsed = notificationTypeSchema.safeParse("FEE_PAYMENT")
    expect(parsed.success).toBe(true)
    expect(notificationTypeSchema.safeParse("ADMIN").success).toBe(true)
    expect(notificationTypeSchema.safeParse("EMAIL").success).toBe(false)
    expect(notificationTypeSchema.safeParse("SMS").success).toBe(false)
    expect(notificationTypeSchema.safeParse("PUSH").success).toBe(false)
  })
})

describe("createNotificationSchema", () => {
  it("requires at least one recipient or role target", () => {
    const empty = createNotificationSchema.safeParse({ title: "Hello", type: "ADMIN" })
    expect(empty.success).toBe(false)
    const withRole = createNotificationSchema.safeParse({ title: "Hello", type: "ADMIN", roleNames: ["TEACHER"] })
    expect(withRole.success).toBe(true)
    const withIds = createNotificationSchema.safeParse({ title: "Hello", type: "ADMIN", recipientIds: ["u1"] })
    expect(withIds.success).toBe(true)
  })

  it("restricts manual type to ADMIN", () => {
    const notAdmin = createNotificationSchema.safeParse({
      title: "Hi",
      type: "FEE_INVOICE",
      roleNames: ["TEACHER"],
    })
    expect(notAdmin.success).toBe(false)
  })

  it("enforces title length and link prefix", () => {
    const tooLong = createNotificationSchema.safeParse({
      title: "x".repeat(121),
      type: "ADMIN",
      roleNames: ["TEACHER"],
    })
    expect(tooLong.success).toBe(false)
    const badLink = createNotificationSchema.safeParse({
      title: "Hi",
      type: "ADMIN",
      roleNames: ["TEACHER"],
      linkPath: "http://evil.example/portal",
    })
    expect(badLink.success).toBe(false)
    const goodLink = createNotificationSchema.safeParse({
      title: "Hi",
      type: "ADMIN",
      roleNames: ["TEACHER"],
      linkPath: "/portal",
    })
    expect(goodLink.success).toBe(true)
  })

  it("caps role targets and recipient ids", () => {
    const tooManyRoles = createNotificationSchema.safeParse({
      title: "Hi",
      type: "ADMIN",
      roleNames: Array.from({ length: 6 }, (_, index) => `R${index}`),
    })
    expect(tooManyRoles.success).toBe(false)
    const tooManyIds = createNotificationSchema.safeParse({
      title: "Hi",
      type: "ADMIN",
      recipientIds: Array.from({ length: 201 }, (_, index) => `u${index}`),
    })
    expect(tooManyIds.success).toBe(false)
  })

  it("rejects extra fields", () => {
    const extra = createNotificationSchema.safeParse({
      title: "Hi",
      type: "ADMIN",
      roleNames: ["TEACHER"],
      src: "extra",
    })
    expect(extra.success).toBe(false)
  })
})