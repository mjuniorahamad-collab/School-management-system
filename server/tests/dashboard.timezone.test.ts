import { describe, expect, it } from "vitest"
import { dateOnlyMonthKey } from "../src/modules/dashboard/dashboard.rules.js"

// This suite only runs via `vitest.timezone.config.ts` (TZ=America/New_York);
// it is excluded from the default run. It fails loudly if the forced
// negative-UTC-offset host was not actually applied.
describe("dashboard timezone regression harness", () => {
  it("runs under a negative UTC offset", () => {
    // America/New_York is UTC-4 (EDT) or UTC-5 (EST); both yield offset > 0.
    expect(new Date().getTimezoneOffset()).toBeGreaterThan(0)
  })

  it("reproves the host-local trap before checking the UTC fix", () => {
    const stored = new Date("2026-12-01T00:00:00.000Z")
    // On a negative-offset host the local month really is the previous month...
    expect(stored.getMonth()).not.toBe(stored.getUTCMonth())
    // ...but the date-only key must read the stored UTC calendar date.
    expect(dateOnlyMonthKey(stored)).toEqual({ label: "Dec", year: 2026 })
  })
})
