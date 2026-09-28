// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PRINT_DOCUMENT_CLASS, PRINT_HIDDEN, PRINT_MAX_ROWS, PRINT_ONLY, printDocument } from "@/lib/print"

describe("printDocument", () => {
  let printSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    document.head.innerHTML = ""
    document.title = "Original Title"
    printSpy = vi.fn()
    vi.stubGlobal("print", printSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    printSpy.mockRestore()
  })

  function fireAfterPrint() {
    window.dispatchEvent(new Event("afterprint"))
  }

  it("opens the browser print dialog exactly once", () => {
    printDocument()
    expect(printSpy).toHaveBeenCalledTimes(1)
  })

  it("sets the document title, then restores it after printing", () => {
    printDocument({ title: "RCT-2026-0001 — Fees School" })
    expect(document.title).toBe("RCT-2026-0001 — Fees School")

    fireAfterPrint()
    expect(document.title).toBe("Original Title")
  })

  it("keeps the current title when none is supplied", () => {
    printDocument()
    expect(document.title).toBe("Original Title")
  })

  it("ignores a blank title", () => {
    printDocument({ title: "   " })
    expect(document.title).toBe("Original Title")
  })

  it("is a no-op without a browser window", () => {
    vi.stubGlobal("window", undefined)
    expect(() => printDocument({ title: "Anything" })).not.toThrow()
    expect(printSpy).not.toHaveBeenCalled()
  })

  describe("orientation override", () => {
    it("does not inject a page rule for the portrait default", () => {
      printDocument()
      expect(document.getElementById("sms-print-orientation")).toBeNull()
    })

    it("injects an A4 landscape page rule for a wide artifact", () => {
      printDocument({ orientation: "landscape" })
      const style = document.getElementById("sms-print-orientation")
      expect(style).not.toBeNull()
      expect(style?.textContent).toContain("size: A4 landscape")
    })

    it("removes the override after printing so later prints stay portrait", () => {
      printDocument({ orientation: "landscape" })
      expect(document.getElementById("sms-print-orientation")).not.toBeNull()

      fireAfterPrint()
      expect(document.getElementById("sms-print-orientation")).toBeNull()
    })

    it("does not stack overrides across repeated prints", () => {
      printDocument({ orientation: "landscape" })
      fireAfterPrint()
      printDocument({ orientation: "landscape" })

      const styles = document.querySelectorAll("#sms-print-orientation")
      expect(styles).toHaveLength(1)
    })
  })

  it("restores state when window.print throws", () => {
    printSpy.mockImplementation(() => {
      throw new Error("no print available")
    })
    printDocument({ title: "Broken", orientation: "landscape" })

    expect(document.title).toBe("Original Title")
    expect(document.getElementById("sms-print-orientation")).toBeNull()
  })
})

describe("print constants", () => {
  it("caps a full-dataset print at 500 rows", () => {
    expect(PRINT_MAX_ROWS).toBe(500)
  })

  it("keeps Tailwind print variants as literal class strings", () => {
    // Tailwind's JIT only emits a utility when it can see the full literal, so
    // these constants must never be assembled dynamically.
    expect(PRINT_HIDDEN).toBe("print:hidden")
    expect(PRINT_ONLY).toBe("hidden print:block")
    expect(PRINT_DOCUMENT_CLASS).toBe("print-document")
  })
})
