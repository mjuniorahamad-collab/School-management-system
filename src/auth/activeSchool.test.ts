import { describe, expect, it, afterEach, beforeEach, vi } from "vitest"
import { clearActiveSchoolId, getActiveSchoolId, setActiveSchoolId } from "./activeSchool"

describe("activeSchool", () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    })
    clearActiveSchoolId()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    clearActiveSchoolId()
  })

  it("returns null before any selection", () => {
    expect(getActiveSchoolId()).toBeNull()
  })

  it("keeps the selection in memory", () => {
    setActiveSchoolId("school-a")
    expect(getActiveSchoolId()).toBe("school-a")
  })

  it("persists the selection to localStorage", () => {
    setActiveSchoolId("school-a")
    expect(store.get("sms.activeSchoolId")).toBe("school-a")
  })

  it("clears the persisted selection", () => {
    setActiveSchoolId("school-a")
    clearActiveSchoolId()
    expect(getActiveSchoolId()).toBeNull()
    expect(store.has("sms.activeSchoolId")).toBe(false)
  })

  it("reads a persisted selection on a fresh page load", async () => {
    store.set("sms.activeSchoolId", "school-b")

    vi.resetModules()
    const fresh = await import("./activeSchool")

    expect(fresh.getActiveSchoolId()).toBe("school-b")
    fresh.clearActiveSchoolId()
  })
})