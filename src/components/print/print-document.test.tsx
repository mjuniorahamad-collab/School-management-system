// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PrintDocument, PrintTitleBlock } from "@/components/print/PrintDocument"
import { branding } from "@/config/branding"
import type { BrandingResponse } from "@/types/settings"

const brandingMock = vi.hoisted(() => ({ data: undefined as BrandingResponse | undefined }))

vi.mock("@/hooks/useBranding", () => ({ useBranding: () => brandingMock }))

afterEach(() => {
  cleanup()
  brandingMock.data = undefined
})

/** A fully-populated tenant identity, as /branding now returns it. */
function loadedBranding(overrides: Partial<BrandingResponse> = {}): BrandingResponse {
  return {
    schoolName: "Bright Future International School",
    tagline: "Excellence",
    schoolShortName: "BFIS",
    contactPhone: "+91 80 4000 1000",
    contactEmail: "office@brightfuture.example.com",
    addressLine1: "12 Lake Road",
    addressLine2: null,
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    country: "India",
    ...overrides,
  }
}

describe("PrintDocument", () => {
  it("renders a letterhead, title, body and note", () => {
    brandingMock.data = loadedBranding()
    const { container } = render(
      <PrintDocument title="Fee Receipt" subtitle="RCT-1" note="Immutable record.">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector("h1")?.textContent).toBe("Fee Receipt")
    expect(container.textContent).toContain("RCT-1")
    expect(container.textContent).toContain("Body")
    expect(container.textContent).toContain("Immutable record.")
  })

  it("leaves no empty note block behind when a note is absent", () => {
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector("h1")?.nextElementSibling).toBeNull()
    // The "Printed <date>" stamp now lives in the footer band on its own class, so
    // an absent note leaves no stray note element and no extra vertical space.
    expect(container.querySelectorAll(".print-document-note")).toHaveLength(0)
  })

  it("adds exactly one body note when one is supplied", () => {
    const { container } = render(
      <PrintDocument title="Fee Receipt" note="Immutable record.">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelectorAll(".print-document-note")).toHaveLength(1)
  })

  it("renders the document frame only when asked", () => {
    const { container: unframed } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )
    expect(unframed.querySelector(".print-document-frame")).toBeNull()

    cleanup()
    const { container: framed } = render(
      <PrintDocument title="Fee Receipt" frame>
        <p>Body</p>
      </PrintDocument>,
    )
    expect(framed.querySelector(".print-document-frame")).not.toBeNull()
  })

  it("always renders the repeating footer band with the school and document name", () => {
    brandingMock.data = loadedBranding()
    const { container } = render(
      <PrintDocument title="Attendance Register">
        <p>Body</p>
      </PrintDocument>,
    )

    const footer = container.querySelector(".print-document-footer")
    expect(footer).not.toBeNull()
    expect(footer?.textContent).toContain("Bright Future International School")
    expect(footer?.textContent).toContain("Attendance Register")
    expect(footer?.textContent).toContain("Printed")
  })

  it("does NOT print a fabricated paper page number", () => {
    // Chromium honours neither @page margin boxes nor a per-page counter, so the
    // footer must not claim "Page 1 of 1" it cannot actually know.
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector(".print-document-footer")?.textContent).not.toMatch(/Page\s+\d+\s+of\s+\d+/i)
  })

  it("renders an eyebrow when supplied", () => {
    const { container } = render(
      <PrintDocument title="Fee Receipt" eyebrow="Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector(".print-document-eyebrow")?.textContent).toBe("Receipt")
  })
})

describe("PrintLetterhead branding resolution", () => {
  it("uses the loaded tenant identity and contact block", () => {
    brandingMock.data = loadedBranding()
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector(".print-document-school-name")?.textContent).toBe(
      "Bright Future International School",
    )
    expect(container.textContent).toContain("Excellence")
    expect(container.textContent).toContain("12 Lake Road")
    expect(container.textContent).toContain("Bengaluru, Karnataka, 560001")
    expect(container.textContent).toContain("India")
    expect(container.textContent).toContain("+91 80 4000 1000")
    expect(container.textContent).toContain("office@brightfuture.example.com")
  })

  it("renders NO tagline when the server says the tenant has none", () => {
    // Regression: `data?.tagline || branding.schoolTagline` used to print the
    // build-time default school's tagline — "International School" — on every
    // other tenant's receipt.
    brandingMock.data = loadedBranding({ schoolName: "Portal School A", tagline: null })
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.textContent).not.toContain("International School")
    expect(container.textContent).not.toContain(branding.schoolTagline)
    expect(container.querySelector(".print-document-tagline")).toBeNull()
  })

  it("omits the contact lines when the tenant set none", () => {
    brandingMock.data = loadedBranding({
      schoolShortName: null,
      contactPhone: null,
      contactEmail: null,
      addressLine1: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
    })
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.textContent).not.toContain("12 Lake Road")
    expect(container.textContent).not.toContain("+91 80 4000 1000")
  })

  it("derives the monogram from the configured short identity", () => {
    brandingMock.data = loadedBranding({ schoolShortName: "BFIS" })
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector(".print-document-monogram")?.textContent).toBe("BFIS")
  })

  it("derives the monogram from the school name when no short identity is set", () => {
    // Significant words only: "International" and "School" must not be counted.
    brandingMock.data = loadedBranding({ schoolShortName: null })
    const { container } = render(
      <PrintDocument title="Fee Receipt">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.querySelector(".print-document-monogram")?.textContent).toBe("BF")
  })

  it("falls back to the build-time branding only while the request is unresolved", () => {
    brandingMock.data = undefined
    const { container } = render(
      <PrintDocument title="Attendance Register">
        <p>Body</p>
      </PrintDocument>,
    )

    expect(container.textContent).toContain(branding.schoolName)
  })
})

describe("PrintTitleBlock", () => {
  it("renders title and subtitle", () => {
    const { container } = render(<PrintTitleBlock title="Fee Invoice" subtitle="INV-1" />)

    expect(container.querySelector("h1")?.textContent).toBe("Fee Invoice")
    expect(container.textContent).toContain("INV-1")
  })
})
