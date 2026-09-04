import { describe, expect, it } from "vitest"
import {
  PERMISSION_CODES,
  ROLE_PERMISSIONS,
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
      const parts = code.split(":")
      expect(parts).toHaveLength(2)
      expect(parts[0]).not.toBe("")
      expect(parts[1]).not.toBe("")
    }
  })

  it("catalog codes are unique", () => {
    const unique = new Set(PERMISSION_CODES)
    expect(unique.size).toBe(PERMISSION_CODES.length)
  })
})
