// Pure, database-free validation for the dedicated timetable scale-test login.
//
// Shared by the guarded scale-fixture script (scripts/timetable-scale-fixtures.ts)
// and its DB-free contract suite, so the rules the script enforces are defined
// once and can never drift from what is tested. Producing only plain values — no
// Prisma client, no environment mutation, no I/O — keeps it trivially testable and
// impossible to misuse against a wrong database.
//
// The two concerns are deliberately separate: seeding needs both the email and the
// password, but cleanup only ever needs the identity, so it must not be gated on a
// password that has no bearing on which rows to remove.

export const SCALE_ADMIN_EMAIL_ENV = "TIMETABLE_SCALE_TEST_ADMIN_EMAIL"
export const SCALE_ADMIN_PASSWORD_ENV = "TIMETABLE_SCALE_TEST_ADMIN_PASSWORD"

/**
 * RFC 2606 reserves `.invalid` precisely so it can never resolve to a real mail
 * domain. Constraining the fixture identity here guarantees the test login can
 * never collide with, or be mistaken for, a real mailbox.
 */
const RESERVED_INVALID_TLD = "invalid"

/** Minimum accepted password length; deliberately longer than any throwaway value. */
export const MIN_SCALE_ADMIN_PASSWORD_LENGTH = 12

const LOCAL_PART = /^[a-z0-9][a-z0-9._%+-]*$/

export interface ScaleAdminIdentity {
  /** Normalized exactly as the login path normalizes it (trim + lowercase). */
  email: string
}

export interface ScaleAdminCredentials extends ScaleAdminIdentity {
  password: string
}

/**
 * Validates the dedicated test email alone. Throws with a message that names the
 * environment variable but never echoes the supplied value, so a bad `run` cannot
 * leak the secret into a log.
 */
export function validateScaleAdminEmail(raw: string | undefined): ScaleAdminIdentity {
  const value = (raw ?? "").trim()
  if (value === "") {
    throw new Error(`${SCALE_ADMIN_EMAIL_ENV} is not set.`)
  }

  const email = value.toLowerCase()
  const at = email.lastIndexOf("@")
  if (at <= 0 || at === email.length - 1) {
    throw new Error(`${SCALE_ADMIN_EMAIL_ENV} is not a valid email address.`)
  }

  const localPart = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!LOCAL_PART.test(localPart)) {
    throw new Error(`${SCALE_ADMIN_EMAIL_ENV} has an invalid local part.`)
  }
  // Accept the reserved TLD itself ("name@invalid") or a subdomain of it
  // ("name@scale.invalid"); reject every real TLD.
  if (domain.slice(domain.lastIndexOf(".") + 1) !== RESERVED_INVALID_TLD) {
    throw new Error(
      `${SCALE_ADMIN_EMAIL_ENV} must end in the reserved ".${RESERVED_INVALID_TLD}" domain.`,
    )
  }

  return { email }
}

/** Validates the seed credentials (email + password) as one unit. */
export function validateScaleAdminCredentials(
  env: Record<string, string | undefined>,
): ScaleAdminCredentials {
  const { email } = validateScaleAdminEmail(env[SCALE_ADMIN_EMAIL_ENV])

  const password = env[SCALE_ADMIN_PASSWORD_ENV] ?? ""
  if (password === "") {
    throw new Error(`${SCALE_ADMIN_PASSWORD_ENV} is not set.`)
  }
  if (password.length < MIN_SCALE_ADMIN_PASSWORD_LENGTH) {
    throw new Error(
      `${SCALE_ADMIN_PASSWORD_ENV} must be at least ${MIN_SCALE_ADMIN_PASSWORD_LENGTH} characters.`,
    )
  }

  return { email, password }
}
