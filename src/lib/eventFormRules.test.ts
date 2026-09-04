import { describe, expect, it } from "vitest"
import { eventFormToPayload, validateEventForm } from "./eventFormRules"

const base = {
  title: "Sports Day",
  description: "",
  category: "SPORTS",
  status: "SCHEDULED",
  startAt: "2026-11-20T08:00:00.000Z",
  endAt: "2026-11-20T16:00:00.000Z",
  location: "",
} as const

describe("validateEventForm (frontend, DOM-free)", () => {
  it("accepts a valid event", () => {
    expect(validateEventForm(base)).toEqual([])
  })

  it("rejects an empty title", () => {
    expect(validateEventForm({ ...base, title: " " })).toEqual(
      expect.arrayContaining([{ field: "title", message: "Event title is required" }]),
    )
  })

  it("rejects an invalid category", () => {
    const errors = validateEventForm({
      ...base,
      category: "GOVERNORS",
    } as unknown as Parameters<typeof validateEventForm>[0])
    expect(errors).toEqual(
      expect.arrayContaining([{ field: "category", message: "Invalid category" }]),
    )
  })

  it("rejects an end that precedes or equals the start", () => {
    expect(validateEventForm({ ...base, endAt: "2026-11-20T07:00:00.000Z" })).toEqual(
      expect.arrayContaining([{ field: "endAt", message: "End date/time must be after start" }]),
    )
  })

  it("rejects missing/invalid date-times", () => {
    expect(validateEventForm({ ...base, startAt: "", endAt: "" })).toEqual(
      expect.arrayContaining([
        { field: "startAt", message: "A valid start date/time is required" },
        { field: "endAt", message: "A valid end date/time is required" },
      ]),
    )
  })
})

describe("eventFormToPayload (frontend, DOM-free)", () => {
  it("maps to ISO strings and includes optionals", () => {
    const out = eventFormToPayload({
      ...base,
      description: " Annual meet ",
      location: " Main Field ",
    })
    expect(out.title).toBe("Sports Day")
    expect(out.startAt).toBe(new Date("2026-11-20T08:00:00.000Z").toISOString())
    expect(out.description).toBe("Annual meet")
    expect(out.location).toBe("Main Field")
    expect(out.category).toBe("SPORTS")
  })

  it("preserves multi-line description from server (edit-mode regression)", () => {
    const serverDescription = "Line 1\nLine 2\nLine 3 — special chars: <>&\"'"
    const payload = eventFormToPayload({
      ...base,
      description: serverDescription,
    })
    expect(payload.description).toBe(serverDescription)
  })

  it("does not lose description when title is unchanged (edit-mode data integrity)", () => {
    const payload = eventFormToPayload({
      ...base,
      description: "Original description that must survive the edit cycle",
    })
    expect(payload.description).toBe("Original description that must survive the edit cycle")
    expect(payload.title).toBe("Sports Day")
  })

  it("omits description when empty (not sent to server)", () => {
    const payload = eventFormToPayload({
      ...base,
      description: "",
    })
    expect(payload).not.toHaveProperty("description")
  })
})
