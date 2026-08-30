// Development seed for the identity & authorization foundation.
//
// Idempotent: safe to run repeatedly. Creates/reconciles the school, academic
// sessions, the full permission catalogue, the eleven roles with their grants,
// and — only when NODE_ENV is NOT production — a super admin from
// SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. It never prints a password and never
// overwrites an existing user's password hash.

import { PrismaClient } from "@prisma/client"
import { hashPassword } from "../src/auth/password.js"
import { buildAdmissionNumber } from "../src/modules/students/admission-number.js"
import {
  PERMISSION_CODES,
  ROLE_DESCRIPTIONS,
  ROLE_NAMES,
  ROLE_PERMISSIONS,
  describePermission,
  type RoleName,
} from "../src/permissions/permissions.js"

try {
  process.loadEnvFile()
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  if (code !== "ENOENT") throw error
}

const prisma = new PrismaClient()

const SCHOOL_CODE = "BFIS"
const SCHOOL_NAME = "Bright Future International School"
const SUPER_ADMIN_ROLE = ROLE_NAMES.SUPER_ADMIN

// ── Students module fixtures (synthetic development data — no real people) ──
const CLASS_NAMES = ["6", "7", "8", "9", "10"]
const SECTION_NAMES = ["A", "B"]

interface GuardianSeed {
  name: string
  email: string
  phone: string
}

const GUARDIAN_SEEDS: GuardianSeed[] = [
  { name: "Rajesh Kumar Singh", email: "rajesh.singh@guardian.example", phone: "+91 98111 22334" },
  { name: "Sunita Devi Singh", email: "sunita.singh@guardian.example", phone: "+91 98222 33445" },
  { name: "Arun Prakash Sharma", email: "arun.sharma@guardian.example", phone: "+91 98333 44556" },
  { name: "Priya Sharma", email: "priya.sharma@guardian.example", phone: "+91 98444 55667" },
  { name: "Manoj Kumar Verma", email: "manoj.verma@guardian.example", phone: "+91 98555 66778" },
  { name: "Kavita Verma", email: "kavita.verma@guardian.example", phone: "+91 98666 77889" },
  { name: "Vikram Malhotra", email: "vikram.malhotra@guardian.example", phone: "+91 98777 88990" },
  { name: "Anita Malhotra", email: "anita.malhotra@guardian.example", phone: "+91 98888 99001" },
  { name: "Suresh Iyer", email: "suresh.iyer@guardian.example", phone: "+91 98999 00112" },
  { name: "Meenakshi Iyer", email: "meenakshi.iyer@guardian.example", phone: "+91 98100 11223" },
  { name: "Hitesh Patel", email: "hitesh.patel@guardian.example", phone: "+91 98211 22334" },
  { name: "Rina Patel", email: "rina.patel@guardian.example", phone: "+91 98322 33445" },
]

interface StudentSeed {
  firstName: string
  middleName?: string
  lastName: string
  gender: "MALE" | "FEMALE"
  age: number
  birthMonth: number
  birthDay: number
  classIndex: number
  section: string
  primaryGuardian: number
  secondaryGuardian?: number
  phone: string
  city: string
  state: string
}

const STUDENT_SEEDS: StudentSeed[] = [
  { firstName: "Aditya", lastName: "Singh", gender: "MALE", age: 12, birthMonth: 3, birthDay: 14, classIndex: 0, section: "A", primaryGuardian: 0, secondaryGuardian: 1, phone: "+91 99000 11001", city: "New Delhi", state: "Delhi" },
  { firstName: "Ananya", middleName: "Priya", lastName: "Sharma", gender: "FEMALE", age: 11, birthMonth: 8, birthDay: 2, classIndex: 0, section: "B", primaryGuardian: 2, secondaryGuardian: 3, phone: "+91 99000 11002", city: "New Delhi", state: "Delhi" },
  { firstName: "Rohan", lastName: "Verma", gender: "MALE", age: 13, birthMonth: 11, birthDay: 21, classIndex: 1, section: "A", primaryGuardian: 4, secondaryGuardian: 5, phone: "+91 99000 11003", city: "Gurugram", state: "Haryana" },
  { firstName: "Ishita", lastName: "Malhotra", gender: "FEMALE", age: 12, birthMonth: 6, birthDay: 9, classIndex: 1, section: "B", primaryGuardian: 6, secondaryGuardian: 7, phone: "+91 99000 11004", city: "Noida", state: "Uttar Pradesh" },
  { firstName: "Kabir", middleName: "Dev", lastName: "Iyer", gender: "MALE", age: 13, birthMonth: 1, birthDay: 17, classIndex: 2, section: "A", primaryGuardian: 8, secondaryGuardian: 9, phone: "+91 99000 11005", city: "New Delhi", state: "Delhi" },
  { firstName: "Diya", lastName: "Patel", gender: "FEMALE", age: 14, birthMonth: 12, birthDay: 5, classIndex: 2, section: "B", primaryGuardian: 10, secondaryGuardian: 11, phone: "+91 99000 11006", city: "Ghaziabad", state: "Uttar Pradesh" },
  { firstName: "Aarav", middleName: "Raj", lastName: "Sharma", gender: "MALE", age: 14, birthMonth: 4, birthDay: 28, classIndex: 3, section: "A", primaryGuardian: 2, secondaryGuardian: 3, phone: "+91 99000 11007", city: "New Delhi", state: "Delhi" },
  { firstName: "Mira", lastName: "Kapoor", gender: "FEMALE", age: 13, birthMonth: 9, birthDay: 12, classIndex: 3, section: "B", primaryGuardian: 4, secondaryGuardian: 5, phone: "+91 99000 11008", city: "Gurugram", state: "Haryana" },
  { firstName: "Vihaan", lastName: "Singh", gender: "MALE", age: 15, birthMonth: 7, birthDay: 19, classIndex: 4, section: "A", primaryGuardian: 0, secondaryGuardian: 1, phone: "+91 99000 11009", city: "Noida", state: "Uttar Pradesh" },
  { firstName: "Zoya", middleName: "Fatima", lastName: "Khan", gender: "FEMALE", age: 14, birthMonth: 2, birthDay: 23, classIndex: 4, section: "B", primaryGuardian: 6, secondaryGuardian: 7, phone: "+91 99000 11010", city: "New Delhi", state: "Delhi" },
  { firstName: "Advik", lastName: "Nair", gender: "MALE", age: 12, birthMonth: 5, birthDay: 8, classIndex: 0, section: "A", primaryGuardian: 8, secondaryGuardian: 9, phone: "+91 99000 11011", city: "Faridabad", state: "Haryana" },
  { firstName: "Saanvi", lastName: "Reddy", gender: "FEMALE", age: 11, birthMonth: 10, birthDay: 30, classIndex: 0, section: "B", primaryGuardian: 10, secondaryGuardian: 11, phone: "+91 99000 11012", city: "New Delhi", state: "Delhi" },
  { firstName: "Arjun", middleName: "Kumar", lastName: "Menon", gender: "MALE", age: 13, birthMonth: 6, birthDay: 15, classIndex: 2, section: "A", primaryGuardian: 0, secondaryGuardian: 1, phone: "+91 99000 11013", city: "Ghaziabad", state: "Uttar Pradesh" },
  { firstName: "Kiara", lastName: "Arora", gender: "FEMALE", age: 15, birthMonth: 1, birthDay: 27, classIndex: 4, section: "A", primaryGuardian: 2, secondaryGuardian: 3, phone: "+91 99000 11014", city: "New Delhi", state: "Delhi" },
]

function assertGrantsValid(): void {
  const known = new Set<string>(PERMISSION_CODES)
  for (const role of Object.keys(ROLE_PERMISSIONS) as RoleName[]) {
    for (const code of ROLE_PERMISSIONS[role]) {
      if (!known.has(code)) {
        throw new Error(`Seed grant error: role ${role} references unknown permission "${code}"`)
      }
    }
  }
}

async function seedSchool() {
  return prisma.school.upsert({
    where: { code: SCHOOL_CODE },
    update: { name: SCHOOL_NAME, status: "ACTIVE" },
    create: { name: SCHOOL_NAME, code: SCHOOL_CODE, status: "ACTIVE" },
  })
}

async function seedAcademicSessions(schoolId: string) {
  const year = new Date().getFullYear()

  const sessions = [
    {
      name: `Academic Year ${year}-${year + 1}`,
      code: `AY${year}-${year + 1}`,
      startDate: new Date(Date.UTC(year, 7, 1)),
      endDate: new Date(Date.UTC(year + 1, 5, 30)),
      status: "ACTIVE" as const,
    },
    {
      name: `Academic Year ${year + 1}-${year + 2}`,
      code: `AY${year + 1}-${year + 2}`,
      startDate: new Date(Date.UTC(year + 1, 7, 1)),
      endDate: new Date(Date.UTC(year + 2, 5, 30)),
      status: "UPCOMING" as const,
    },
  ]

  for (const session of sessions) {
    await prisma.academicSession.upsert({
      where: { schoolId_code: { schoolId, code: session.code } },
      update: {
        name: session.name,
        startDate: session.startDate,
        endDate: session.endDate,
        status: session.status,
      },
      create: { ...session, schoolId },
    })
  }
}

async function seedPermissions() {
  for (const code of PERMISSION_CODES) {
    const [resource, action] = code.split(":")
    await prisma.permission.upsert({
      where: { code },
      update: { resource, action, description: describePermission(code) },
      create: { code, resource, action, description: describePermission(code) },
    })
  }
}

async function seedRoles() {
  const roleIds = new Map<RoleName, string>()
  for (const name of Object.keys(ROLE_NAMES) as RoleName[]) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { description: ROLE_DESCRIPTIONS[name] },
      create: { name, description: ROLE_DESCRIPTIONS[name] },
    })
    roleIds.set(name, role.id)
  }
  return roleIds
}

async function seedRolePermissions(roleIds: Map<RoleName, string>) {
  for (const role of Object.keys(ROLE_NAMES) as RoleName[]) {
    const codes: readonly string[] = ROLE_PERMISSIONS[role]
    const targetPermissions = await prisma.permission.findMany({
      where: { code: { in: [...codes] } },
    })
    const permissionIds = targetPermissions.map((permission) => permission.id)

    await prisma.rolePermission.deleteMany({ where: { roleId: roleIds.get(role)! } })
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId: roleIds.get(role)!,
          permissionId,
        })),
      })
    }
  }
}

async function seedSuperAdmin(schoolId: string, roleIds: Map<RoleName, string>): Promise<void> {
  const isProduction = process.env.NODE_ENV === "production"
  if (isProduction) {
    console.warn("Seeding in production: skipping super admin creation")
    return
  }

  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.SEED_ADMIN_PASSWORD

  if (!email || !password) {
    console.warn(
      "SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping super admin creation. " +
        "Set them in .env to create the dev super admin.",
    )
    return
  }
  if (password.length < 8) {
    throw new Error("SEED_ADMIN_PASSWORD must be at least 8 characters")
  }

  const existing = await prisma.user.findUnique({ where: { email } })

  if (existing) {
    await prisma.user.update({ where: { email }, data: { name: "System Administrator", status: "ACTIVE" } })
  } else {
    await prisma.user.create({
      data: {
        email,
        name: "System Administrator",
        passwordHash: hashPassword(password),
        schoolId,
        status: "ACTIVE",
      },
    })
  }

  const superRoleId = roleIds.get(SUPER_ADMIN_ROLE)
  if (!superRoleId) throw new Error("SUPER_ADMIN role not seeded")

  const admin = await prisma.user.findUniqueOrThrow({ where: { email } })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: superRoleId } },
    update: {},
    create: { userId: admin.id, roleId: superRoleId },
  })

  console.log(`Seeded super admin: ${email}`)
}

async function seedAcademicStructure(schoolId: string): Promise<void> {
  for (let index = 0; index < CLASS_NAMES.length; index += 1) {
    const name = CLASS_NAMES[index]
    const cls = await prisma.class.upsert({
      where: { schoolId_name: { schoolId, name } },
      update: { sortOrder: index + 1 },
      create: { schoolId, name, sortOrder: index + 1 },
    })
    for (const sectionName of SECTION_NAMES) {
      await prisma.section.upsert({
        where: { classId_name: { classId: cls.id, name: sectionName } },
        update: {},
        create: { classId: cls.id, name: sectionName },
      })
    }
  }
}

async function seedGuardians(schoolId: string): Promise<void> {
  const existing = await prisma.guardian.count({ where: { schoolId } })
  if (existing > 0) return
  await prisma.guardian.createMany({
    data: GUARDIAN_SEEDS.map((guardian) => ({ ...guardian, schoolId })),
  })
}

async function seedStudents(
  schoolId: string,
  session: { id: string; startDate: Date },
): Promise<void> {
  const guardians = await prisma.guardian.findMany({
    where: { schoolId },
    orderBy: { createdAt: "asc" },
  })
  const guardianByName = new Map(guardians.map((guardian) => [guardian.name, guardian]))
  if (guardians.length < GUARDIAN_SEEDS.length) {
    throw new Error("Students seeding requires the guardian fixtures to exist")
  }

  const classes = await prisma.class.findMany({
    where: { schoolId },
    include: { sections: true },
    orderBy: { sortOrder: "asc" },
  })

  const year = session.startDate.getUTCFullYear()

  for (let index = 0; index < STUDENT_SEEDS.length; index += 1) {
    const seed = STUDENT_SEEDS[index]
    const cls = classes[seed.classIndex]
    if (!cls) throw new Error(`Seeded class index ${seed.classIndex} is out of range`)

    const section = cls.sections.find((candidate) => candidate.name === seed.section)
    if (!section) throw new Error(`Section "${seed.section}" missing in class "${cls.name}"`)

    const admissionNumber = buildAdmissionNumber(year, index + 1)
    const dateOfBirth = new Date(Date.UTC(year - seed.age, seed.birthMonth - 1, seed.birthDay))

    const student = await prisma.student.upsert({
      where: { schoolId_admissionNumber: { schoolId, admissionNumber } },
      update: {
        firstName: seed.firstName,
        middleName: seed.middleName,
        lastName: seed.lastName,
        gender: seed.gender,
        dateOfBirth,
        phone: seed.phone,
        city: seed.city,
        state: seed.state,
      },
      create: {
        schoolId,
        admissionNumber,
        firstName: seed.firstName,
        middleName: seed.middleName,
        lastName: seed.lastName,
        gender: seed.gender,
        dateOfBirth,
        status: "ACTIVE",
        phone: seed.phone,
        city: seed.city,
        state: seed.state,
        email: `${seed.firstName.toLowerCase()}.${seed.lastName.toLowerCase()}@student.example`,
        admissionDate: session.startDate,
        emergencyContactName: GUARDIAN_SEEDS[seed.primaryGuardian].name,
        emergencyContactPhone: GUARDIAN_SEEDS[seed.primaryGuardian].phone,
      },
    })

    await prisma.studentEnrollment.upsert({
      where: {
        studentId_academicSessionId: { studentId: student.id, academicSessionId: session.id },
      },
      update: { classId: cls.id, sectionId: section.id },
      create: {
        studentId: student.id,
        academicSessionId: session.id,
        classId: cls.id,
        sectionId: section.id,
      },
    })

    const primaryName = GUARDIAN_SEEDS[seed.primaryGuardian].name
    const primaryGuardian = guardianByName.get(primaryName)
    if (!primaryGuardian) throw new Error(`Guardian fixture "${primaryName}" not found`)

    await prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId: student.id, guardianId: primaryGuardian.id } },
      update: { relationshipType: "GUARDIAN", isPrimary: true, isEmergencyContact: true },
      create: {
        studentId: student.id,
        guardianId: primaryGuardian.id,
        relationshipType: "GUARDIAN",
        isPrimary: true,
        isEmergencyContact: true,
      },
    })

    if (seed.secondaryGuardian !== undefined) {
      const secondaryName = GUARDIAN_SEEDS[seed.secondaryGuardian].name
      const secondaryGuardian = guardianByName.get(secondaryName)
      if (!secondaryGuardian) throw new Error(`Guardian fixture "${secondaryName}" not found`)

      await prisma.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: student.id, guardianId: secondaryGuardian.id } },
        update: { relationshipType: "PARENT" },
        create: {
          studentId: student.id,
          guardianId: secondaryGuardian.id,
          relationshipType: "PARENT",
          isPrimary: false,
          isEmergencyContact: false,
        },
      })
    }
  }

  // Advance the school's admission counter past the seeded range so numbers
  // generated by the application never collide with seed fixtures.
  const studentCount = await prisma.student.count({ where: { schoolId } })
  const school = await prisma.school.findUniqueOrThrow({ where: { id: schoolId } })
  if (school.admissionCounter <= studentCount) {
    await prisma.school.update({
      where: { id: schoolId },
      data: { admissionCounter: studentCount + 1 },
    })
  }
}

async function main(): Promise<void> {
  assertGrantsValid()

  const school = await seedSchool()
  await seedAcademicSessions(school.id)
  await seedPermissions()
  const roleIds = await seedRoles()
  await seedRolePermissions(roleIds)
  await seedSuperAdmin(school.id, roleIds)

  const activeSession = await prisma.academicSession.findFirstOrThrow({
    where: { schoolId: school.id, status: "ACTIVE" },
  })

  await seedAcademicStructure(school.id)
  await seedGuardians(school.id)
  await seedStudents(
    school.id,
    { id: activeSession.id, startDate: activeSession.startDate },
  )

  const studentCount = await prisma.student.count({ where: { schoolId: school.id } })

  console.log(
    `Seed complete — school="${school.name}" permissions=${PERMISSION_CODES.length} roles=${Object.keys(ROLE_NAMES).length} students=${studentCount}`,
  )
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })