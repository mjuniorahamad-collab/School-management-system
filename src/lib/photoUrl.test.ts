import { describe, expect, it } from "vitest"
import { photoDisplayUrl, portalChildPhotoUrl } from "./photoUrl"

describe("photoDisplayUrl", () => {
  it("builds the admin photo URL with the storage key as the cache-buster", () => {
    expect(photoDisplayUrl("students", "stu-123", "photos/sch/students/a.png")).toBe(
      "/api/v1/students/stu-123/photo?v=photos%2Fsch%2Fstudents%2Fa.png",
    )
  })

  it("encodes the person id", () => {
    expect(photoDisplayUrl("students", "stu 1/2", "k.png")).toBe(
      "/api/v1/students/stu%201%2F2/photo?v=k.png",
    )
  })

  it("returns null when there is no photo key", () => {
    expect(photoDisplayUrl("teachers", "t-1", null)).toBeNull()
    expect(photoDisplayUrl("staff", "s-1", "")).toBeNull()
  })
})

describe("portalChildPhotoUrl", () => {
  it("builds the ownership-scoped portal photo URL for the given child", () => {
    expect(portalChildPhotoUrl("child-42", "photos/sch/students/x.png")).toBe(
      "/api/v1/me/children/child-42/photo?v=photos%2Fsch%2Fstudents%2Fx.png",
    )
  })

  it("uses the child's id and storage key, never another student's", () => {
    const url = portalChildPhotoUrl("child-1", "key-1")
    expect(url).toContain("/me/children/child-1/photo")
    expect(url).toContain("v=key-1")
    expect(url).not.toContain("child-2")
  })

  it("returns null when the child has no photo key", () => {
    expect(portalChildPhotoUrl("child-1", null)).toBeNull()
    expect(portalChildPhotoUrl("child-1", "")).toBeNull()
  })
})