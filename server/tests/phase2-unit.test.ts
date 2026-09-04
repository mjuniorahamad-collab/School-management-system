import { describe, expect, it } from "vitest"
import { normalizeFeeHeadCode } from "../src/modules/fee-heads/fee-head.rules.js"
import { normalizeExamTypeCode } from "../src/modules/exam-types/exam-type.rules.js"
import { noticeUpdateData } from "../src/modules/notices/notice.rules.js"
import { createEventSchema } from "../src/modules/events/event.schema.js"
import { createGradingBandSchema } from "../src/modules/grading-bands/grading-band.schema.js"
import { createPeriodSlotSchema } from "../src/modules/period-slots/period-slot.schema.js"
import {
  schoolSettingsSchema,
  updateSettingsSchema,
} from "../src/modules/settings/setting.schema.js"

describe("master data normalization (database-free)", () => {
  it("normalizes fee head codes to trimmed uppercase", () => {
    expect(normalizeFeeHeadCode("  tuition  ")).toBe("TUITION")
    expect(normalizeFeeHeadCode("bus fee")).toBe("BUS FEE")
  })

  it("normalizes exam type codes to trimmed uppercase", () => {
    expect(normalizeExamTypeCode("  midterm ")).toBe("MIDTERM")
  })
})

describe("settings schema validation (database-free)", () => {
  it("accepts a complete valid settings payload", () => {
    const result = schoolSettingsSchema.safeParse({
      schoolName: "Bright Future International School",
      primaryColor: "#4f46e5",
      attendanceLateGraceMinutes: 5,
      gradingPassPercent: 40,
      feeEnableOnlinePayments: true,
    })
    expect(result.success).toBe(true)
  })

  it("rejects an invalid color with a field-level message", () => {
    const result = schoolSettingsSchema.safeParse({ primaryColor: "indigo" })
    if (result.success) throw new Error("expected failure")
    const issue = result.error.issues.find((i) => i.path[0] === "primaryColor")
    expect(issue).toBeDefined()
    expect(issue!.message).toMatch(/hex/i)
  })

  it("rejects an invalid percentage range", () => {
    const result = schoolSettingsSchema.safeParse({ gradingPassPercent: 101 })
    expect(result.success).toBe(false)
  })

  it("rejects empty schoolName with a specific message", () => {
    const result = schoolSettingsSchema.safeParse({ schoolName: "" })
    if (result.success) throw new Error("expected failure")
    const issue = result.error.issues.find((i) => i.path[0] === "schoolName")
    expect(issue!.message).toMatch(/required/i)
  })

  it("update schema accepts a partial payload", () => {
    const result = updateSettingsSchema.safeParse({ feeCurrency: "GBP" })
    expect(result.success).toBe(true)
  })
})

describe("master-data schemas (database-free)", () => {
  it("period slot requires start before end", () => {
    const ok = createPeriodSlotSchema.safeParse({ name: "P1", startTime: "08:00", endTime: "09:00" })
    expect(ok.success).toBe(true)
    const bad = createPeriodSlotSchema.safeParse({ name: "P1", startTime: "10:00", endTime: "09:00" })
    expect(bad.success).toBe(false)
  })

  it("grabbing band requires min <= max", () => {
    const ok = createGradingBandSchema.safeParse({ minPercent: 80, maxPercent: 100, grade: "A" })
    expect(ok.success).toBe(true)
    const bad = createGradingBandSchema.safeParse({ minPercent: 90, maxPercent: 50, grade: "A" })
    expect(bad.success).toBe(false)
  })

  it("event requires end after start", () => {
    const ok = createEventSchema.safeParse({
      title: "Sports Day",
      startAt: "2026-09-10T08:00:00.000Z",
      endAt: "2026-09-10T12:00:00.000Z",
    })
    expect(ok.success).toBe(true)
    const bad = createEventSchema.safeParse({
      title: "Sports Day",
      startAt: "2026-09-10T12:00:00.000Z",
      endAt: "2026-09-10T08:00:00.000Z",
    })
    expect(bad.success).toBe(false)
  })
})

describe("notice publish lifecycle (database-free)", () => {
  it("stamps publishedAt the first time a notice is published", () => {
    const draft = { status: "DRAFT" } as never
    const data = noticeUpdateData(draft, { status: "PUBLISHED" })
    expect(data.publishedAt).toBeInstanceOf(Date)
  })

  it("does not re-stamp publishedAt when already published", () => {
    const published = { status: "PUBLISHED" } as never
    const data = noticeUpdateData(published, { status: "PUBLISHED" })
    expect(data.publishedAt).toBeUndefined()
  })

  it("carries through content updates", () => {
    const notice = { status: "DRAFT" } as never
    const data = noticeUpdateData(notice, { title: "New title", audience: "STUDENTS" })
    expect(data.title).toBe("New title")
    expect(data.audience).toBe("STUDENTS")
  })
})
