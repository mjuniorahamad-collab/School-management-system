import { describe, expect, it } from "vitest"
import { userFormToCreatePayload, validateUserForm } from "./userFormRules"
import type { UserFormValue } from "./userFormRules"

function validValue(overrides: Partial<UserFormValue> = {}): UserFormValue {
  return { name: "Priya Sharma", email: "priya@example.com", password: "password123", roleId: "r1", status: "ACTIVE", ...overrides }
}

describe("validateUserForm (frontend, DOM-free)", () => {
  it("accepts a valid create payload", () => {
    const errors = validateUserForm(validValue(), { requirePassword: true })
    expect(errors).toEqual([])
  })

  it("flags a blank name, email, and role (with password required)", () => {
    const errors = validateUserForm(validValue({ name: "", email: "", password: "", roleId: "" }), {
      requirePassword: true,
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "name", message: "Name is required" },
        { field: "email", message: "Email is required" },
        { field: "password", message: "Password is required" },
        { field: "roleId", message: "Role is required" },
      ]),
    )
  })

  it("flags a malformed email and short password", () => {
    const errors = validateUserForm(validValue({ email: "nope", password: "short" }), {
      requirePassword: true,
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "email", message: "Enter a valid email address" },
        { field: "password", message: "Password must be at least 8 characters" },
      ]),
    )
  })

  it("does not require a password when one is not requested (edit mode)", () => {
    const errors = validateUserForm(validValue({ password: "" }))
    expect(errors).toEqual([])
  })

  it("flags over-long name and email", () => {
    const errors = validateUserForm(validValue({ name: "x".repeat(121), email: `${"a".repeat(198)}@x.io` }))
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "name", message: "Name must be 120 characters or fewer" },
        { field: "email", message: "Email must be 200 characters or fewer" },
      ]),
    )
  })
})

describe("userFormToCreatePayload", () => {
  it("trims and lowercases email, includes password only when provided", () => {
    const payload = userFormToCreatePayload(validValue({ name: " Priya Sharma ", email: " PRIYA@EXAMPLE.COM ", password: "secret123" }))
    expect(payload).toEqual({ name: "Priya Sharma", email: "priya@example.com", password: "secret123", roleId: "r1" })
  })

  it("omits password when blank", () => {
    const payload = userFormToCreatePayload(validValue({ password: "" }))
    expect(payload.password).toBeUndefined()
  })
})