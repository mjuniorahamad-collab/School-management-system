import { describe, expect, it } from "vitest"
import { brandingText } from "../src/modules/settings/setting.service.js"
import type { BrandingResponse } from "../src/modules/settings/setting.types.js"

// DB-free contract for the branding projection's blank-value normalisation.
//
// The SchoolSetting key/value store has no null: an unset key is persisted as "".
// `getBranding` therefore normalises every projected optional field, so a client
// (notably the print letterhead) can treat `null` as "this tenant has not set it"
// and must not substitute a fallback value belonging to another school. This
// suite is DB-free; the HTTP-level behaviour is covered by branding.integration.

describe("branding projection value normalisation", () => {
  it("maps an unset value to null", () => {
    expect(brandingText(undefined)).toBeNull()
  })

  it("maps an empty stored value to null", () => {
    expect(brandingText("")).toBeNull()
  })

  it("maps a whitespace-only stored value to null", () => {
    expect(brandingText("   ")).toBeNull()
    expect(brandingText("\t\n ")).toBeNull()
  })

  it("preserves a real value", () => {
    expect(brandingText("Bengaluru")).toBe("Bengaluru")
    expect(brandingText("+91 80 4000 1000")).toBe("+91 80 4000 1000")
    expect(brandingText("560001")).toBe("560001")
  })

  it("trims surrounding whitespace from a real value", () => {
    expect(brandingText("  Lake Road  ")).toBe("Lake Road")
  })
})

describe("BrandingResponse shape", () => {
  // Locks the deliberate narrowness of the projection. The endpoint is
  // requireAuth-only and reachable by portal parents, so operational settings must
  // never be added here; they stay behind `settings:view`.
  const EXPECTED_KEYS = [
    "addressLine1",
    "addressLine2",
    "city",
    "contactEmail",
    "contactPhone",
    "country",
    "postalCode",
    "schoolName",
    "schoolShortName",
    "state",
    "tagline",
  ]

  it("declares exactly the identity + public contact fields", () => {
    // A compile-time-typed fixture: TypeScript itself fails this suite if the
    // interface grows a key the runtime assertions in branding.integration.test.ts
    // have not been taught about.
    const fixture: BrandingResponse = {
      schoolName: "Portal School A Editable",
      tagline: null,
      schoolShortName: "PSA",
      contactPhone: "+91 80 4000 1000",
      contactEmail: "office@portalschoola.example.com",
      addressLine1: "12 Lake Road",
      addressLine2: null,
      city: "Bengaluru",
      state: null,
      postalCode: "560001",
      country: "India",
    }

    expect(Object.keys(fixture).sort()).toEqual([...EXPECTED_KEYS].sort())
  })
})
