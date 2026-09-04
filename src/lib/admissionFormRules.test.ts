import { describe, expect, it } from "vitest"
import {
  admissionDetailToForm,
  admissionFormToPayload,
  validateAdmissionForm,
} from "./admissionFormRules"

const baseForm = () => ({
  firstName: "Aditya",
  middleName: "",
  lastName: "Kumar",
  dateOfBirth: "2015-05-01",
  gender: "MALE" as const,
  email: "aditya@example.com",
  phone: "9876543210",
  addressLine1: "",
  addressLine2: "",
  city: "Austin",
  state: "TX",
  postalCode: "",
  preferredAcademicSessionId: "",
  preferredClassId: "class-1",
  preferredSectionId: "",
  guardianName: "Ravi Kumar",
  guardianPhone: "9876543210",
  guardianEmail: "",
  guardianRelationshipType: "PARENT" as const,
})

describe("validateAdmissionForm (frontend, DOM-free)", () => {
  it("accepts a valid application", () => {
    expect(validateAdmissionForm(baseForm())).toEqual([])
  })

  it("flags a blank first name, date of birth and guardian name", () => {
    const errors = validateAdmissionForm({
      ...baseForm(),
      firstName: " ",
      dateOfBirth: "",
      guardianName: "",
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "firstName", message: "First name is required" },
        { field: "dateOfBirth", message: "Use YYYY-MM-DD format" },
        { field: "guardianName", message: "Guardian name is required" },
      ]),
    )
  })

  it("requires at least one guardian contact", () => {
    const errors = validateAdmissionForm({
      ...baseForm(),
      guardianPhone: "",
      guardianEmail: "",
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "guardianPhone", message: "Provide at least one of guardian phone or email" },
      ]),
    )
  })

  it("rejects malformed emails", () => {
    const errors = validateAdmissionForm({ ...baseForm(), email: "nope" })
    expect(errors).toEqual(
      expect.arrayContaining([{ field: "email", message: "Enter a valid email address" }]),
    )
  })
})

describe("admissionFormToPayload (frontend, DOM-free)", () => {
  it("trims required names and drops empty optional strings", () => {
    expect(admissionFormToPayload(baseForm())).toMatchObject({
      firstName: "Aditya",
      guardianName: "Ravi Kumar",
      email: "aditya@example.com",
      middleName: null,
      preferredClassId: "class-1",
      preferredSectionId: undefined,
    })
  })
})

describe("admissionDetailToForm (frontend, DOM-free)", () => {
  it("maps a detail record back to editable form values", () => {
    const form = admissionDetailToForm({
      firstName: "Aditya",
      middleName: null,
      lastName: "Kumar",
      dateOfBirth: "2015-05-01T00:00:00.000Z",
      gender: "MALE",
      email: null,
      phone: "9876543210",
      addressLine1: null,
      addressLine2: null,
      city: "Austin",
      state: "TX",
      postalCode: null,
      preferredAcademicSessionId: null,
      preferredClassId: "class-1",
      preferredSectionId: null,
      guardianName: "Ravi Kumar",
      guardianPhone: "9876543210",
      guardianEmail: null,
      guardianRelationshipType: "PARENT",
    })
    expect(form.firstName).toBe("Aditya")
    expect(form.dateOfBirth).toBe("2015-05-01")
    expect(form.preferredClassId).toBe("class-1")
    expect(form.middleName).toBe("")
  })
})
