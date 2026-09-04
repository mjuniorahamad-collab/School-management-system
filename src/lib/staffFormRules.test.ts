import { describe, expect, it } from "vitest"
import { staffFormToPayload, validateStaffForm } from "./staffFormRules"

describe("validateStaffForm (frontend, DOM-free)", () => {
  it("accepts a valid staff member with required fields", () => {
    const errors = validateStaffForm({
      firstName: "Grace",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "grace@example.com",
      phone: "555-0102",
      address: "",
      department: "Administration",
      designation: "Office Manager",
      qualification: "",
      experience: "",
      joiningDate: "2026-02-01",
    })
    expect(errors).toEqual([])
  })

  it("flags a blank first name, gender, department, designation, and joining date", () => {
    const errors = validateStaffForm({
      firstName: "",
      middleName: "",
      lastName: "",
      gender: "",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      department: "",
      designation: "",
      qualification: "",
      experience: "",
      joiningDate: "",
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "firstName", message: "First name is required" },
        { field: "gender", message: "Gender is required" },
        { field: "department", message: "Department is required" },
        { field: "designation", message: "Designation is required" },
        { field: "joiningDate", message: "Joining date is required" },
      ]),
    )
  })

  it("flags a malformed joining date and email", () => {
    const errors = validateStaffForm({
      firstName: "Grace",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "nope",
      phone: "",
      address: "",
      department: "Admin",
      designation: "Manager",
      qualification: "",
      experience: "",
      joiningDate: "02/01/2026",
    })
    expect(errors).toEqual(
      expect.arrayContaining([
        { field: "joiningDate", message: "Use YYYY-MM-DD format" },
        { field: "email", message: "Enter a valid email address" },
      ]),
    )
  })
})

describe("staffFormToPayload (frontend, DOM-free)", () => {
  it("maps required fields and trims them", () => {
    const payload = staffFormToPayload({
      firstName: " Grace ",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      department: " Admin ",
      designation: " Manager ",
      qualification: "",
      experience: "",
      joiningDate: "2026-02-01",
    })
    expect(payload).toEqual({
      firstName: "Grace",
      gender: "FEMALE",
      department: "Admin",
      designation: "Manager",
      joiningDate: "2026-02-01",
    })
  })

  it("includes optional fields and a valid integer experience", () => {
    const payload = staffFormToPayload({
      firstName: "Grace",
      middleName: "B",
      lastName: "Hopper",
      gender: "FEMALE",
      dateOfBirth: "1980-03-15",
      email: "grace@example.com",
      phone: "555-0102",
      address: "2nd St",
      department: "Administration",
      designation: "Office Manager",
      qualification: "BA",
      experience: "20",
      joiningDate: "2026-02-01",
    })
    expect(payload).toMatchObject({
      middleName: "B",
      lastName: "Hopper",
      dateOfBirth: "1980-03-15",
      email: "grace@example.com",
      phone: "555-0102",
      address: "2nd St",
      qualification: "BA",
      experience: 20,
    })
  })

  it("drops non-integer or negative experience", () => {
    const payload = staffFormToPayload({
      firstName: "Grace",
      middleName: "",
      lastName: "",
      gender: "FEMALE",
      dateOfBirth: "",
      email: "",
      phone: "",
      address: "",
      department: "Admin",
      designation: "Manager",
      qualification: "",
      experience: "-3",
      joiningDate: "2026-02-01",
    })
    expect(payload.experience).toBeUndefined()
  })
})
