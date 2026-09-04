import { describe, expect, it } from "vitest"
import { teacherFormToPayload, validateTeacherForm } from "./teacherFormRules"

describe("validateTeacherForm (frontend, DOM-free)", () => {
  it("accepts a valid teacher with required fields", () => {
    const errors = validateTeacherForm({
      firstName: "Ada",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "ada@example.com",
      phone: "555-0101",
      address: "",
      designation: "Mathematics Teacher",
      qualification: "",
      experience: "",
      joiningDate: "2026-01-15",
    })
    expect(errors).toEqual([])
  })

  it("flags a blank first name, gender, designation, and joining date", () => {
    const errors = validateTeacherForm({
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      designation: "",
      qualification: "",
      experience: "",
      joiningDate: "",
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "firstName", message: "First name is required" },
        { field: "gender", message: "Gender is required" },
        { field: "designation", message: "Designation is required" },
        { field: "joiningDate", message: "Joining date is required" },
      ]),
    )
  })

  it("flags a malformed joining date and email", () => {
    const errors = validateTeacherForm({
      firstName: "Ada",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "not-an-email",
      phone: "",
      address: "",
      designation: "Teacher",
      qualification: "",
      experience: "",
      joiningDate: "15/01/2026",
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "joiningDate", message: "Use YYYY-MM-DD format" },
        { field: "email", message: "Enter a valid email address" },
      ]),
    )
  })
})

describe("teacherFormToPayload (frontend, DOM-free)", () => {
  it("maps required fields and trims them", () => {
    const payload = teacherFormToPayload({
      firstName: " Ada ",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      designation: " Teacher ",
      qualification: "",
      experience: "",
      joiningDate: "2026-01-15",
    })
    expect(payload).toEqual({
      firstName: "Ada",
      gender: "FEMALE",
      designation: "Teacher",
      joiningDate: "2026-01-15",
    })
  })

  it("includes optional fields and a valid integer experience", () => {
    const payload = teacherFormToPayload({
      firstName: "Ada",
      middleName: "M",
      lastName: "Lovelace",
      gender: "FEMALE",
      dateOfBirth: "1985-05-10",
      email: "ada@example.com",
      phone: "555-0101",
      address: "1st St",
      designation: "Teacher",
      qualification: "MSc",
      experience: "12",
      joiningDate: "2026-01-15",
    })
    expect(payload).toMatchObject({
      middleName: "M",
      lastName: "Lovelace",
      dateOfBirth: "1985-05-10",
      email: "ada@example.com",
      phone: "555-0101",
      address: "1st St",
      qualification: "MSc",
      experience: 12,
    })
  })

  it("drops non-integer or negative experience", () => {
    const payload = teacherFormToPayload({
      firstName: "Ada",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      designation: "Teacher",
      qualification: "",
      experience: "2.5",
      joiningDate: "2026-01-15",
    })
    expect(payload.experience).toBeUndefined()
  })
})
