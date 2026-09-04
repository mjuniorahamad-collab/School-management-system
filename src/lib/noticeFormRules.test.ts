import { describe, expect, it } from "vitest"
import { noticeFormToPayload, validateNoticeForm } from "./noticeFormRules"

describe("validateNoticeForm (frontend, DOM-free)", () => {
  it("accepts a valid notice", () => {
    expect(
      validateNoticeForm({
        title: "Holiday",
        body: "School closed Friday",
        audience: "PARENTS",
        status: "DRAFT",
        priority: "HIGH",
      }),
    ).toEqual([])
  })

  it("flags a blank title and body", () => {
    expect(
      validateNoticeForm({
        title: " ",
        body: "",
        audience: "EVERYONE",
        status: "DRAFT",
        priority: "MEDIUM",
      }),
    ).toEqual(
      expect.arrayContaining([
        { field: "title", message: "Notice title is required" },
        { field: "body", message: "Notice body is required" },
      ]),
    )
  })

  it("rejects an out-of-catalog audience", () => {
    const errors = validateNoticeForm({
      title: "Holiday",
      body: "Closed",
      audience: "GOVERNORS",
      status: "DRAFT",
      priority: "MEDIUM",
    } as unknown as Parameters<typeof validateNoticeForm>[0])
    expect(errors).toEqual(expect.arrayContaining([{ field: "audience", message: "Invalid audience" }]))
  })
})

describe("noticeFormToPayload (frontend, DOM-free)", () => {
  it("trims title/body and keeps audience/status/priority", () => {
    expect(
      noticeFormToPayload({
        title: " Holiday ",
        body: " Closed ",
        audience: "PARENTS",
        status: "PUBLISHED",
        priority: "LOW",
      }),
    ).toEqual({ title: "Holiday", body: "Closed", audience: "PARENTS", status: "PUBLISHED", priority: "LOW" })
  })

  it("preserves multi-line body content from server (edit-mode regression)", () => {
    const serverBody = "Line 1\nLine 2\nLine 3 — special chars: <>&\"'"
    const payload = noticeFormToPayload({
      title: "Notice",
      body: serverBody,
      audience: "STUDENTS",
      status: "DRAFT",
      priority: "MEDIUM",
    })
    expect(payload.body).toBe(serverBody)
  })

  it("does not lose body when title is unchanged (edit-mode data integrity)", () => {
    const payload = noticeFormToPayload({
      title: "Original Title",
      body: "Original body content that must survive the edit cycle",
      audience: "TEACHERS",
      status: "PUBLISHED",
      priority: "HIGH",
    })
    expect(payload.body).toBe("Original body content that must survive the edit cycle")
    expect(payload.title).toBe("Original Title")
  })
})
