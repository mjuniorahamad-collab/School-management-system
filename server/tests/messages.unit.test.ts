import { describe, expect, it } from "vitest"
import { buildDirectKey, GROUP_CONVERSATION_LIMIT, truncatePreview } from "../src/modules/messages/message.rules.js"
import {
  addParticipantsSchema,
  createConversationSchema,
  listConversationsQuerySchema,
  listMessagesQuerySchema,
  listRecipientsQuerySchema,
  sendMessageSchema,
} from "../src/modules/messages/message.schema.js"

describe("message directKey", () => {
  it("is symmetric regardless of argument order", () => {
    expect(buildDirectKey("user-a", "user-b")).toBe(buildDirectKey("user-b", "user-a"))
  })

  it("is a sorted colon-joined pair", () => {
    expect(buildDirectKey("zz-top", "aa-first")).toBe("aa-first:zz-top")
  })
})

describe("truncatePreview", () => {
  it("keeps short bodies intact", () => {
    expect(truncatePreview("hello")).toBe("hello")
  })

  it("trim-preview is bounded by the configured length", () => {
    const long = "x".repeat(1000)
    const preview = truncatePreview(long)
    expect(preview).toHaveLength(GROUP_CONVERSATION_LIMIT * 0 + 160)
    expect(preview.endsWith("…")).toBe(true)
  })

  it("leaves a body exactly at the limit untouched", () => {
    const exact = "y".repeat(160)
    expect(truncatePreview(exact)).toBe(exact)
  })
})

describe("createConversationSchema", () => {
  const direct = { type: "DIRECT", recipientIds: ["ade"] }

  it("accepts a valid direct conversation", () => {
    expect(createConversationSchema.safeParse(direct).success).toBe(true)
  })

  it("rejects a direct conversation without a recipient", () => {
    const result = createConversationSchema.safeParse({ type: "DIRECT" })
    expect(result.success).toBe(false)
  })

  it("rejects a direct conversation with more than one recipient", () => {
    const result = createConversationSchema.safeParse({ type: "DIRECT", recipientIds: ["a", "b"] })
    expect(result.success).toBe(false)
  })

  it("rejects a direct conversation with a title or role targets", () => {
    expect(createConversationSchema.safeParse({ ...direct, title: "Nope" }).success).toBe(false)
    expect(createConversationSchema.safeParse({ ...direct, roleNames: ["TEACHER"] }).success).toBe(false)
  })

  it("accepts a group conversation with a title and recipients", () => {
    expect(createConversationSchema.safeParse({ type: "GROUP", title: "Staff", recipientIds: ["a", "b"] }).success).toBe(true)
  })

  it("accepts a role-targeted group conversation", () => {
    expect(createConversationSchema.safeParse({ type: "GROUP", title: "All teachers", roleNames: ["TEACHER"] }).success).toBe(true)
  })

  it("rejects a group conversation without a title", () => {
    expect(createConversationSchema.safeParse({ type: "GROUP", recipientIds: ["a"] }).success).toBe(false)
  })

  it("rejects a group conversation without any targets", () => {
    expect(createConversationSchema.safeParse({ type: "GROUP", title: "Empty" }).success).toBe(false)
  })

  it("rejects unknown fields via strict mode", () => {
    expect(createConversationSchema.safeParse({ ...direct, surprise: 1 }).success).toBe(false)
  })
})

describe("sendMessageSchema", () => {
  it("accepts a reasonable body", () => {
    expect(sendMessageSchema.safeParse({ body: "Meeting moved to 3pm" }).success).toBe(true)
  })

  it("rejects blank bodies", () => {
    expect(sendMessageSchema.safeParse({ body: "   " }).success).toBe(false)
  })

  it("rejects over-long bodies", () => {
    expect(sendMessageSchema.safeParse({ body: "x".repeat(4001) }).success).toBe(false)
  })

  it("rejects extra fields", () => {
    expect(sendMessageSchema.safeParse({ body: "Hello", replyTo: "x" }).success).toBe(false)
  })
})

describe("addParticipantsSchema", () => {
  it("accepts recipient targets", () => {
    expect(addParticipantsSchema.safeParse({ recipientIds: ["a", "b"] }).success).toBe(true)
  })

  it("rejects a body with no targets", () => {
    expect(addParticipantsSchema.safeParse({}).success).toBe(false)
  })

  it("rejects unknown fields", () => {
    expect(addParticipantsSchema.safeParse({ recipientIds: ["a"], nope: 1 }).success).toBe(false)
  })
})

describe("paginated query schemas", () => {
  it("coerces page and pageSize with defaults", () => {
    const parsed = listConversationsQuerySchema.parse({})
    expect(parsed.page).toBe(1)
    expect(parsed.pageSize).toBe(20)
  })

  it("bounds pageSize at 100", () => {
    expect(listConversationsQuerySchema.safeParse({ pageSize: 100 }).success).toBe(true)
    expect(listConversationsQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false)
  })

  it("accepts a before cursor as an ISO datetime", () => {
    expect(listMessagesQuerySchema.safeParse({ before: "2026-09-06T10:00:00.000Z" }).success).toBe(true)
    expect(listMessagesQuerySchema.safeParse({ before: "not-a-date" }).success).toBe(false)
  })
})

describe("listRecipientsQuerySchema", () => {
  it("coerces the limit and defaults to the search cap", () => {
    expect(listRecipientsQuerySchema.parse({}).limit).toBe(25)
    expect(listRecipientsQuerySchema.parse({ limit: "5" }).limit).toBe(5)
  })

  it("accepts role filters as repeated or comma-separated values", () => {
    expect(listRecipientsQuerySchema.parse({ roleNames: ["TEACHER", "PARENT"] }).roleNames).toEqual(["TEACHER", "PARENT"])
    expect(listRecipientsQuerySchema.parse({ roleNames: "TEACHER,PARENT" }).roleNames).toEqual(["TEACHER", "PARENT"])
  })
})