import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import {
  MIN_SCALE_ADMIN_PASSWORD_LENGTH,
  SCALE_ADMIN_EMAIL_ENV,
  SCALE_ADMIN_PASSWORD_ENV,
  validateScaleAdminCredentials,
  validateScaleAdminEmail,
} from "./helpers/timetable-scale-credentials.js"

// DB-free coverage for the dedicated timetable scale-test login:
//  1. the pure credential validation the fixture script enforces, and
//  2. a source contract pinning the safety invariants that a DB run would need a
//     live database to observe (marker scoping, FK ordering, never deleting the
//     shared role, no `.env`/SEED_ADMIN fallback, no credential logging).

const VALID_EMAIL = "timetable.scale.admin@scale.invalid"
const VALID_PASSWORD = "scale-test-password-1234"

describe("validateScaleAdminEmail", () => {
  it("normalizes trim + lowercase exactly like the login path", () => {
    expect(validateScaleAdminEmail("  Admin@Scale.INVALID  ")).toEqual({
      email: "admin@scale.invalid",
    })
  })

  it("accepts the reserved TLD itself", () => {
    expect(validateScaleAdminEmail("admin@invalid").email).toBe("admin@invalid")
  })

  it.each(["", "   ", undefined])("rejects a missing/blank email (%p)", (raw) => {
    expect(() => validateScaleAdminEmail(raw)).toThrow(SCALE_ADMIN_EMAIL_ENV)
  })

  it.each([
    "no-at-sign",
    "@scale.invalid",
    "admin@",
    "ad min@scale.invalid",
    "admin@scale.invalid.example.com",
    "admin@gmail.com",
    "admin@scale.test",
  ])("rejects a non-reserved / malformed identity (%s)", (raw) => {
    expect(() => validateScaleAdminEmail(raw)).toThrow()
  })

  it("never echoes the supplied value in its error message", () => {
    let message = ""
    try {
      validateScaleAdminEmail("super-secret-mailbox@gmail.com")
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).not.toContain("super-secret-mailbox")
    expect(message).not.toContain("gmail.com")
  })
})

describe("validateScaleAdminCredentials", () => {
  const base = {
    [SCALE_ADMIN_EMAIL_ENV]: VALID_EMAIL,
    [SCALE_ADMIN_PASSWORD_ENV]: VALID_PASSWORD,
  }

  it("returns the normalized email and the password", () => {
    expect(validateScaleAdminCredentials(base)).toEqual({
      email: VALID_EMAIL,
      password: VALID_PASSWORD,
    })
  })

  it("requires the email even when the password is present", () => {
    expect(() => validateScaleAdminCredentials({ [SCALE_ADMIN_PASSWORD_ENV]: VALID_PASSWORD })).toThrow(
      SCALE_ADMIN_EMAIL_ENV,
    )
  })

  it("requires a password", () => {
    expect(() => validateScaleAdminCredentials({ [SCALE_ADMIN_EMAIL_ENV]: VALID_EMAIL })).toThrow(
      SCALE_ADMIN_PASSWORD_ENV,
    )
    expect(() =>
      validateScaleAdminCredentials({ ...base, [SCALE_ADMIN_PASSWORD_ENV]: "" }),
    ).toThrow(SCALE_ADMIN_PASSWORD_ENV)
  })

  it("requires a password at least as long as the documented minimum", () => {
    const tooShort = "s".repeat(MIN_SCALE_ADMIN_PASSWORD_LENGTH - 1)
    expect(() =>
      validateScaleAdminCredentials({ ...base, [SCALE_ADMIN_PASSWORD_ENV]: tooShort }),
    ).toThrow(SCALE_ADMIN_PASSWORD_ENV)
  })

  it("never echoes the supplied password in its error message", () => {
    let message = ""
    try {
      validateScaleAdminCredentials({ ...base, [SCALE_ADMIN_PASSWORD_ENV]: "leaky-pw" })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).not.toContain("leaky-pw")
  })
})

describe("scale-fixture script safety contract", () => {
  const source = readFileSync(
    path.resolve(import.meta.dirname, "../../scripts/timetable-scale-fixtures.ts"),
    "utf8",
  )
  // Assert against executable source, not prose: the header comment legitimately
  // names the variables the script must never read.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "")

  it("reads no .env and falls back to no other database or credential variable", () => {
    expect(source).not.toMatch(/loadEnvFile/)
    expect(code).not.toMatch(/process\.env\.DATABASE_URL/)
    expect(code).not.toMatch(/process\.env\.TEST_DATABASE_URL/)
    expect(code).not.toMatch(/process\.env\.SEED_ADMIN/)
  })

  it("uses the shared credential validators and the real password hasher", () => {
    expect(code).toMatch(/validateScaleAdminCredentials/)
    expect(code).toMatch(/validateScaleAdminEmail/)
    expect(code).toMatch(/hashPassword\(/)
  })

  it("reuses the canonical SUPER_ADMIN role and never deletes a role", () => {
    expect(code).toMatch(/SUPER_ADMIN_ROLE/)
    expect(code).not.toMatch(/prisma\.role\.delete/)
    expect(code).not.toMatch(/role\.deleteMany/)
  })

  it("removes the fixture-school audit rows before deleting the marker school", () => {
    const auditDelete = code.indexOf("prisma.auditLog.deleteMany")
    const schoolDelete = code.indexOf("prisma.school.deleteMany")
    expect(auditDelete).toBeGreaterThan(-1)
    expect(schoolDelete).toBeGreaterThan(auditDelete)
  })

  it("deletes only the dedicated fixture user, identified by its validated email", () => {
    expect(code).toMatch(/prisma\.user\.deleteMany\(\{ where: \{ email \} \}\)/)
  })

  it("scopes every row deletion to the fixture marker", () => {
    expect(code).toMatch(/name: FIXTURE_SCHOOL_NAME/)
  })

  it("never logs a credential or its hash", () => {
    const logLines = code
      .split("\n")
      .filter((line) => line.includes("console.log") || line.includes("console.error"))
      .join("\n")
    expect(logLines).not.toMatch(/password/i)
    expect(logLines).not.toMatch(/passwordHash/)
    expect(logLines).not.toMatch(/credentials\./)
  })
})
