// Canonical permission catalog and role grants.
//
// Permission codes follow `resource:action`. This file is the single source of
// truth for codes seeded into the `Permission` table and the role grants seeded
// into `RolePermission`. The seed script validates every granted code against
// PERMISSION_CODES so typos fail loudly at seed time.

export const PERMISSION_CODES = [
  "dashboard:view",
  "students:view",
  "students:create",
  "students:update",
  "students:delete",
  "students:export",
  "teachers:view",
  "teachers:create",
  "teachers:update",
  "teachers:delete",
  "staff:view",
  "staff:create",
  "staff:update",
  "staff:delete",
  "admissions:view",
  "admissions:create",
  "admissions:update",
  "admissions:delete",
  "attendance:view",
  "attendance:create",
  "attendance:update",
  "fees:view",
  "fees:create",
  "fees:update",
  "fees:delete",
  "fees:export",
  "exams:view",
  "exams:create",
  "exams:update",
  "exams:delete",
  "results:view",
  "results:create",
  "results:update",
  "results:export",
  "results:publish",
  "library:view",
  "library:create",
  "library:update",
  "library:delete",
  "library:issue",
  "library:return",
  "transport:view",
  "transport:create",
  "transport:update",
  "transport:delete",
  "academic-sessions:view",
  "academic-sessions:create",
  "academic-sessions:update",
  "classes:view",
  "classes:create",
  "classes:update",
  "classes:delete",
  "sections:view",
  "sections:create",
  "sections:update",
  "sections:delete",
  "subjects:view",
  "subjects:create",
  "subjects:update",
  "subjects:delete",
  "timetable:view",
  "timetable:create",
  "timetable:update",
  "timetable:delete",
  "homework:view",
  "homework:create",
  "homework:update",
  "homework:delete",
  "assignments:view",
  "assignments:create",
  "assignments:update",
  "assignments:delete",
  "payments:view",
  "payments:create",
  "payments:update",
  "receipts:view",
  "receipts:create",
  "receipts:export",
  "reports:view",
  "reports:export",
  "notices:view",
  "notices:create",
  "notices:update",
  "notices:delete",
  "events:view",
  "events:create",
  "events:update",
  "events:delete",
  "messages:view",
  "messages:create",
  "users:view",
  "users:create",
  "users:update",
  "users:delete",
  "roles:view",
  "roles:create",
  "roles:update",
  "roles:delete",
  "settings:view",
  "settings:update",
  "audit-logs:view",
  "audit-logs:export",
  // Portal (student/parent self-service). `portal:view` gates the actor's own
  // ownership-scoped portal; `portal:update` manages identity<->profile links
  // (account provisioning by school staff — never by the parent themselves).
  "portal:view",
  "portal:update",
  // Notifications (per-user in-app feed). `notifications:view` is universal —
  // every member of a tenant can see their own notifications (parents/students
  // included); `notifications:create` is restricted to leadership who may send
  // school-targeted notifications to roles.
  "notifications:view",
  "notifications:create",
] as const

export type PermissionCode = (typeof PERMISSION_CODES)[number]

export const SUPER_ADMIN_ROLE = "SUPER_ADMIN"

export const ROLE_NAMES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  SCHOOL_ADMIN: "SCHOOL_ADMIN",
  PRINCIPAL: "PRINCIPAL",
  TEACHER: "TEACHER",
  ACCOUNTANT: "ACCOUNTANT",
  LIBRARIAN: "LIBRARIAN",
  TRANSPORT_MANAGER: "TRANSPORT_MANAGER",
  RECEPTIONIST: "RECEPTIONIST",
  PARENT: "PARENT",
  STUDENT: "STUDENT",
} as const

export type RoleName = keyof typeof ROLE_NAMES

/**
 * Roles a tenant administrator may assign to a user within their own tenant.
 * Platform-level roles (SUPER_ADMIN) are excluded: they are granted explicitly
 * by a platform super admin and never by a tenant admin, preventing a tenant
 * from escalating a user to cross-tenant platform access.
 */
export const ASSIGNABLE_ROLE_NAMES = (Object.keys(ROLE_NAMES) as RoleName[]).filter(
  (name) => name !== ROLE_NAMES.SUPER_ADMIN,
)

export function isAssignableRoleName(name: string): boolean {
  return (ASSIGNABLE_ROLE_NAMES as readonly string[]).includes(name)
}

export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  SUPER_ADMIN: "Unrestricted access to every system resource and setting",
  SCHOOL_ADMIN: "Day-to-day operational control across all school modules",
  PRINCIPAL: "Leadership oversight of academics, staff, and student outcomes",
  TEACHER: "Classroom management: teaching resources, attendance, and assessment",
  ACCOUNTANT: "Financial operations: fees, payments, and reporting",
  LIBRARIAN: "Library catalogue and circulation management",
  TRANSPORT_MANAGER: "Transport routes, vehicles, and student assignments",
  RECEPTIONIST: "Front desk: admissions intake and general enquiries",
  PARENT: "Own child's academics, attendance, and fee standing",
  STUDENT: "Own attendance, timetable, and assessment results",
}

const VIEW = "view"
const CREATE = "create"
const UPDATE = "update"
const DELETE = "delete"
const EXPORT = "export"

/** Builds `resource:action` codes from an explicit action list. */
const codes = (resource: string, actions: readonly string[]): readonly string[] =>
  actions.map((action) => `${resource}:${action}`)

export const ROLE_PERMISSIONS: Record<RoleName, readonly string[]> = {
  // SUPER_ADMIN is granted everything by role check (hasPermission bypass) and
  // by full RolePermission seeding — never by email.
  SUPER_ADMIN: PERMISSION_CODES,

  SCHOOL_ADMIN: PERMISSION_CODES,

  PRINCIPAL: [
    "dashboard:view",
    ...codes("students", [VIEW, CREATE, UPDATE, EXPORT]),
    ...codes("teachers", [VIEW, CREATE, UPDATE]),
    ...codes("staff", [VIEW, CREATE, UPDATE]),
    ...codes("admissions", [VIEW, CREATE, UPDATE]),
    "attendance:view",
    ...codes("academic-sessions", [VIEW, CREATE, UPDATE]),
    ...codes("classes", [VIEW, CREATE, UPDATE]),
    ...codes("sections", [VIEW, CREATE, UPDATE]),
    ...codes("subjects", [VIEW, CREATE, UPDATE]),
    "timetable:view",
    "homework:view",
    "assignments:view",
    "exams:view",
    "results:view",
    "results:export",
    "results:publish",
    ...codes("fees", [VIEW, UPDATE, EXPORT]),
    "payments:view",
    "receipts:view",
    "library:view",
    "transport:view",
    ...codes("reports", [VIEW, EXPORT]),
    ...codes("notices", [VIEW, CREATE]),
    ...codes("events", [VIEW, CREATE]),
    "messages:view",
    "audit-logs:view",
    "portal:view",
    "notifications:view",
    "notifications:create",
  ],

  TEACHER: [
    "dashboard:view",
    "students:view",
    ...codes("classes", [VIEW, CREATE, UPDATE]),
    ...codes("sections", [VIEW, CREATE, UPDATE]),
    ...codes("subjects", [VIEW, CREATE, UPDATE]),
    ...codes("timetable", [VIEW, CREATE, UPDATE, DELETE]),
    ...codes("attendance", [VIEW, CREATE, UPDATE]),
    ...codes("homework", [VIEW, CREATE, UPDATE, DELETE]),
    ...codes("assignments", [VIEW, CREATE, UPDATE, DELETE]),
    ...codes("exams", [VIEW, CREATE, UPDATE, DELETE]),
    ...codes("results", [VIEW, CREATE, UPDATE, EXPORT]),
    "library:view",
    "notices:view",
    "events:view",
    ...codes("messages", [VIEW, CREATE]),
    "notifications:view",
  ],

  ACCOUNTANT: [
    "dashboard:view",
    "students:view",
    ...codes("fees", [VIEW, CREATE, UPDATE, EXPORT]),
    ...codes("payments", [VIEW, CREATE, UPDATE]),
    ...codes("receipts", [VIEW, CREATE, EXPORT]),
    ...codes("reports", [VIEW, EXPORT]),
    "results:export",
    "settings:view",
    "notifications:view",
  ],

  LIBRARIAN: [
    "dashboard:view",
    "students:view",
    ...codes("library", [VIEW, CREATE, UPDATE, DELETE]),
    "library:issue",
    "library:return",
    "notices:view",
    "events:view",
    "messages:view",
    "notifications:view",
  ],

  TRANSPORT_MANAGER: [
    "dashboard:view",
    "students:view",
    ...codes("transport", [VIEW, CREATE, UPDATE, DELETE]),
    "messages:view",
    "notifications:view",
  ],

  RECEPTIONIST: [
    "dashboard:view",
    "attendance:view",
    ...codes("admissions", [VIEW, CREATE, UPDATE]),
    ...codes("students", [VIEW, CREATE]),
    "fees:view",
    "notices:view",
    "events:view",
    ...codes("messages", [VIEW, CREATE]),
    "notifications:view",
  ],

  PARENT: [
    // Ownership-scoped portal access only. Parents see their own children's
    // data through the portal service — never the school-wide admin grants.
    "portal:view",
    // Notifications are ownership-scoped too — a parent only ever sees
    // notifications addressed to them (their own user id).
    "notifications:view",
  ],

  STUDENT: [
    // Ownership-scoped portal access only (own records via the resolved
    // linked student profile).
    "portal:view",
    // Notifications are ownership-scoped — a student only ever sees
    // notifications addressed to them (their own user id).
    "notifications:view",
  ],
}

/** Human description for a permission code, e.g. `students:view` → `View students`. */
export function describePermission(code: string): string {
  const [resource, action] = code.split(":")
  const actionLabel = action ? `${action.charAt(0).toUpperCase()}${action.slice(1)}` : "Access"
  return `${actionLabel} ${resource}`
}