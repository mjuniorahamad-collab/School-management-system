import { describe, expect, it } from "vitest"
import {
  PERMISSION_CODES,
  ROLE_PERMISSIONS,
  describePermission,
  parsePermissionCode,
  type RoleName,
} from "../src/permissions/permissions.js"

describe("permission catalog integrity (database-free)", () => {
  it("every granted permission code is defined in the catalog", () => {
    const known = new Set(PERMISSION_CODES)
    for (const role of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
      for (const code of ROLE_PERMISSIONS[role]) {
        expect(
          known.has(code),
          `role "${role}" grants unknown permission code "${code}"`,
        ).toBe(true)
      }
    }
  })

  it("permission codes follow the resource:action format", () => {
    for (const code of PERMISSION_CODES) {
      // Two-part `resource:action` is the norm; codes may also have three parts
      // (e.g., `enrollment:history:manage`, `report-cards:view`) — allow >= 2
      // segments. Every segment must still be non-empty.
      const parts = code.split(":")
      expect(parts.length).toBeGreaterThanOrEqual(2)
      for (const part of parts) expect(part).not.toBe("")
    }
  })

  it("parses the action from the final segment", () => {
    expect(parsePermissionCode("students:view")).toEqual({
      resource: "students",
      action: "view",
    })
    expect(parsePermissionCode("enrollment:history:manage")).toEqual({
      resource: "enrollment:history",
      action: "manage",
    })
  })

  it("describes multi-segment codes without dropping the action", () => {
    expect(describePermission("students:view")).toBe("View students")
    expect(describePermission("enrollment:history:manage")).toBe("Manage enrollment history")
    expect(describePermission("calendar:manage")).toBe("Manage calendar")
    expect(describePermission("report-cards:view")).toBe("View report-cards")
    expect(describePermission("report-cards:publish")).toBe("Publish report-cards")
  })

  it("catalog codes are unique", () => {
    const unique = new Set(PERMISSION_CODES)
    expect(unique.size).toBe(PERMISSION_CODES.length)
  })
})
