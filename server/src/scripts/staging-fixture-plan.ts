import type { Prisma } from "@prisma/client"

export type FixtureRole = "PRINCIPAL" | "TEACHER"
export type FixtureGender = "MALE" | "FEMALE" | "OTHER"

export interface FixtureUserSpec {
  id: string
  email: string
  name: string
}

export interface FixtureTeacherSpec {
  employeeId: string
  firstName: string
  lastName: string
  email: string
  gender: FixtureGender
  designation: string
  joiningDate: Date
}

export interface FixtureSpec {
  school: { code: string; name: string }
  principal: FixtureUserSpec
  teacher: FixtureUserSpec
  teacherProfile: FixtureTeacherSpec
  requiredRoles: readonly FixtureRole[]
  requiredPermissions: readonly string[]
  teacherForbiddenPermissions: readonly string[]
}

export type FixtureDb = Pick<
  Prisma.TransactionClient,
  | "school"
  | "user"
  | "userRole"
  | "tenantMembership"
  | "teacher"
  | "role"
  | "permission"
  | "rolePermission"
>

type ItemState = "present" | "missing" | "conflict"

interface PlanItem {
  state: ItemState
  detail: string
}

export interface FixtureItems {
  school: PlanItem
  principalUser: PlanItem
  teacherUser: PlanItem
  principalUserRole: PlanItem
  teacherUserRole: PlanItem
  principalMembership: PlanItem
  teacherMembership: PlanItem
  teacherProfile: PlanItem
}

export interface PreflightCatalog {
  roleIds: Record<FixtureRole, string | null>
  permissionIds: Record<string, string | null>
  blockers: string[]
}

export interface FixturePlan {
  items: FixtureItems
  schoolId: string | null
  preflight: PreflightCatalog
}

const ITEM_LABELS: Record<keyof FixtureItems, string> = {
  school: "school",
  principalUser: "principal user",
  teacherUser: "teacher user",
  principalUserRole: "principal UserRole",
  teacherUserRole: "teacher UserRole",
  principalMembership: "principal membership",
  teacherMembership: "teacher membership",
  teacherProfile: "teacher profile",
}
const ITEM_KEYS = Object.keys(ITEM_LABELS) as Array<keyof FixtureItems>

const presentItem = (): PlanItem => ({ state: "present", detail: "already present; no writes" })
const missingItem = (detail: string): PlanItem => ({ state: "missing", detail })
const conflictItem = (detail: string): PlanItem => ({ state: "conflict", detail })

export async function loadPreflight(db: FixtureDb, spec: FixtureSpec): Promise<PreflightCatalog> {
  const roles = await db.role.findMany({
    where: { name: { in: [...spec.requiredRoles] } },
    select: { id: true, name: true },
  })
  const roleIds: Record<FixtureRole, string | null> = { PRINCIPAL: null, TEACHER: null }
  for (const role of spec.requiredRoles) {
    roleIds[role] = roles.find((row) => row.name === role)?.id ?? null
  }

  const permissions = await db.permission.findMany({
    where: { code: { in: [...spec.requiredPermissions] } },
    select: { id: true, code: true },
  })
  const permissionIds: Record<string, string | null> = {}
  for (const code of spec.requiredPermissions) {
    permissionIds[code] = permissions.find((permission) => permission.code === code)?.id ?? null
  }

  const blockers: string[] = []
  for (const role of spec.requiredRoles) {
    if (roleIds[role] === null) blockers.push(`required role ${role} is missing`)
  }
  for (const code of spec.requiredPermissions) {
    if (permissionIds[code] === null) blockers.push(`required permission ${code} is missing`)
  }

  const principalRoleId = roleIds.PRINCIPAL
  const principalPermissionIds = spec.requiredPermissions
    .map((code) => permissionIds[code])
    .filter((id): id is string => id !== null)
  if (principalRoleId !== null && principalPermissionIds.length === spec.requiredPermissions.length) {
    const grants = await db.rolePermission.findMany({
      where: { roleId: principalRoleId, permissionId: { in: principalPermissionIds } },
      select: { permissionId: true },
    })
    const granted = new Set(grants.map((grant) => grant.permissionId))
    for (const code of spec.requiredPermissions) {
      const permissionId = permissionIds[code]
      if (permissionId !== null && !granted.has(permissionId)) {
        blockers.push(`PRINCIPAL must grant ${code}`)
      }
    }
  }

  const teacherRoleId = roleIds.TEACHER
  const forbiddenPermissionIds = spec.teacherForbiddenPermissions
    .map((code) => permissionIds[code])
    .filter((id): id is string => id !== null)
  if (
    teacherRoleId !== null &&
    forbiddenPermissionIds.length === spec.teacherForbiddenPermissions.length
  ) {
    const forbidden = await db.rolePermission.findMany({
      where: { roleId: teacherRoleId, permissionId: { in: forbiddenPermissionIds } },
      select: { permissionId: true },
    })
    const inherited = new Set(forbidden.map((grant) => grant.permissionId))
    for (const code of spec.teacherForbiddenPermissions) {
      const permissionId = permissionIds[code]
      if (permissionId !== null && inherited.has(permissionId)) {
        blockers.push(`TEACHER must not inherit ${code}`)
      }
    }
  }

  return { roleIds, permissionIds, blockers }
}

interface UserRow {
  id: string
  email: string
  name: string
  status: string
  schoolId: string | null
}

async function inspectUser(
  db: FixtureDb,
  expected: FixtureUserSpec,
  schoolId: string | null,
): Promise<PlanItem> {
  const select = { id: true, email: true, name: true, status: true, schoolId: true } as const
  const byId: UserRow | null = await db.user.findUnique({
    where: { id: expected.id },
    select,
  })
  const byEmail: UserRow | null = await db.user.findUnique({
    where: { email: expected.email },
    select,
  })

  if (byId === null && byEmail === null) return missingItem("not found")
  if (byId !== null && byEmail !== null && byId.id !== byEmail.id) {
    return conflictItem(
      `fixed id ${expected.id} and email ${expected.email} belong to different users`,
    )
  }
  if (byId !== null && byId.email !== expected.email) {
    return conflictItem(`user ${expected.id} has a different email`)
  }
  if (byEmail !== null && byEmail.id !== expected.id) {
    return conflictItem(`email ${expected.email} belongs to a different user id`)
  }

  const user = byId ?? byEmail
  if (user === null) return missingItem("not found")
  if (schoolId === null) {
    return conflictItem(`user ${expected.id} exists but the fixture school is missing`)
  }
  if (user.name !== expected.name) return conflictItem(`user ${expected.id} has a different name`)
  if (user.status !== "ACTIVE") return conflictItem(`user ${expected.id} is not ACTIVE`)
  if (user.schoolId !== schoolId) {
    return conflictItem(`user ${expected.id} is linked to a different school`)
  }
  return presentItem()
}

async function inspectUserRole(
  db: FixtureDb,
  userId: string,
  roleId: string | null,
): Promise<PlanItem> {
  if (roleId === null) return missingItem("required role is missing")
  const row = await db.userRole.findUnique({
    where: { userId_roleId: { userId, roleId } },
    select: { id: true },
  })
  return row === null ? missingItem("not found") : presentItem()
}

async function inspectMembership(
  db: FixtureDb,
  userId: string,
  schoolId: string | null,
  roleId: string | null,
  roleName: FixtureRole,
): Promise<PlanItem> {
  if (schoolId === null) return missingItem("requires the fixture school")
  const row = await db.tenantMembership.findUnique({
    where: { userId_schoolId: { userId, schoolId } },
    select: { id: true, roleId: true, status: true, removedAt: true, removedById: true },
  })
  if (row === null) return missingItem("not found")
  if (roleId === null) return conflictItem("required role is missing")
  if (row.roleId !== roleId) return conflictItem(`membership role is not ${roleName}`)
  if (row.status !== "ACTIVE" || row.removedAt !== null || row.removedById !== null) {
    return conflictItem("membership is not an active row")
  }
  return presentItem()
}

interface TeacherRow {
  id: string
  schoolId: string
  userId: string | null
  employeeId: string
  firstName: string
  lastName: string | null
  email: string | null
  gender: string
  designation: string
  joiningDate: Date
  status: string
}

async function inspectTeacher(db: FixtureDb, spec: FixtureSpec, schoolId: string | null): Promise<PlanItem> {
  const select = {
    id: true,
    schoolId: true,
    userId: true,
    employeeId: true,
    firstName: true,
    lastName: true,
    email: true,
    gender: true,
    designation: true,
    joiningDate: true,
    status: true,
  } as const
  const expected = spec.teacherProfile
  const byUser: TeacherRow | null = await db.teacher.findUnique({
    where: { userId: spec.teacher.id },
    select,
  })

  if (schoolId === null) {
    return byUser === null
      ? missingItem("requires the fixture school")
      : conflictItem("teacher profile exists but the fixture school is missing")
  }

  const byEmployee: TeacherRow | null = await db.teacher.findUnique({
    where: { schoolId_employeeId: { schoolId, employeeId: expected.employeeId } },
    select,
  })
  if (byUser === null && byEmployee === null) return missingItem("not found")
  if (byUser !== null && byEmployee !== null && byUser.id !== byEmployee.id) {
    return conflictItem("teacher userId and employeeId belong to different profiles")
  }
  if (byUser === null && byEmployee !== null) {
    return conflictItem(`employeeId ${expected.employeeId} belongs to another teacher`)
  }

  const teacher = byUser ?? byEmployee
  if (teacher === null) return missingItem("not found")
  if (teacher.schoolId !== schoolId) return conflictItem("teacher profile belongs to a different school")
  if (teacher.userId !== spec.teacher.id) return conflictItem("teacher profile is not linked to the fixture user")
  if (teacher.employeeId !== expected.employeeId) return conflictItem("teacher employeeId differs")
  if (teacher.firstName !== expected.firstName || teacher.lastName !== expected.lastName) {
    return conflictItem("teacher name differs")
  }
  if (teacher.email !== expected.email) return conflictItem("teacher email differs")
  if (teacher.gender !== expected.gender) return conflictItem("teacher gender differs")
  if (teacher.designation !== expected.designation) return conflictItem("teacher designation differs")
  if (teacher.joiningDate.getTime() !== expected.joiningDate.getTime()) {
    return conflictItem("teacher joiningDate differs")
  }
  if (teacher.status !== "ACTIVE") return conflictItem("teacher profile is not ACTIVE")
  return presentItem()
}

export async function inspectFixture(
  db: FixtureDb,
  spec: FixtureSpec,
  preflight: PreflightCatalog,
): Promise<FixturePlan> {
  const school = await db.school.findUnique({
    where: { code: spec.school.code },
    select: { id: true, name: true, status: true },
  })
  const schoolId = school?.id ?? null
  const schoolItem: PlanItem =
    school === null
      ? missingItem("not found")
      : school.name === spec.school.name && school.status === "ACTIVE"
        ? presentItem()
        : conflictItem("school name or status differs")

  return {
    schoolId,
    preflight,
    items: {
      school: schoolItem,
      principalUser: await inspectUser(db, spec.principal, schoolId),
      teacherUser: await inspectUser(db, spec.teacher, schoolId),
      principalUserRole: await inspectUserRole(db, spec.principal.id, preflight.roleIds.PRINCIPAL),
      teacherUserRole: await inspectUserRole(db, spec.teacher.id, preflight.roleIds.TEACHER),
      principalMembership: await inspectMembership(
        db,
        spec.principal.id,
        schoolId,
        preflight.roleIds.PRINCIPAL,
        "PRINCIPAL",
      ),
      teacherMembership: await inspectMembership(
        db,
        spec.teacher.id,
        schoolId,
        preflight.roleIds.TEACHER,
        "TEACHER",
      ),
      teacherProfile: await inspectTeacher(db, spec, schoolId),
    },
  }
}

export function isComplete(plan: FixturePlan): boolean {
  return (
    plan.preflight.blockers.length === 0 &&
    ITEM_KEYS.every((key) => plan.items[key].state === "present")
  )
}

export function conflictLines(plan: FixturePlan): string[] {
  return ITEM_KEYS.filter((key) => plan.items[key].state === "conflict").map(
    (key) => `${ITEM_LABELS[key]}: ${plan.items[key].detail}`,
  )
}

export function printPlan(plan: FixturePlan): void {
  console.log(`preflight: ${plan.preflight.blockers.length === 0 ? "ok" : "blocked"}`)
  for (const blocker of plan.preflight.blockers) console.log(`  blocker: ${blocker}`)
  for (const key of ITEM_KEYS) {
    const item = plan.items[key]
    if (item.state === "present") {
      console.log(`${ITEM_LABELS[key]}: already present; no writes`)
    } else {
      console.log(`${ITEM_LABELS[key]}: ${item.state} — ${item.detail}`)
    }
  }
  console.log(`fixture: ${isComplete(plan) ? "complete" : "incomplete"}`)
}
