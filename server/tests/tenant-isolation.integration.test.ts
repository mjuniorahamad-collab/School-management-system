import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Tenant-isolation suite. Verifies that a user authenticated into one school
// can never read or write another school's records — even a SUPER_ADMIN — and
// that the membership-based tenant resolution rejects forged/foreign tenant
// selections and suspended schools. DB-gated like the other integration suites.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

describe.skipIf(!TEST_DATABASE_URL)("Tenant isolation (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }
  const schoolSuspended = { id: "" }

  let teacherBId = ""
  let subjectBId = ""
  let subjectAId = ""
  let periodSlotBId = ""
  let timetableEntryBId = ""
  let attendanceRecordBId = ""

  const agentA = request.agent(app) // membership in A
  const agentB = request.agent(app) // legacy (schoolId=B), no membership

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

    execFileSync(
      process.execPath,
      [
        "node_modules/prisma/build/index.js",
        "migrate",
        "deploy",
        "--schema",
        "server/prisma/schema.prisma",
      ],
      { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" },
    )

    prisma = new PrismaClient()
    await resetAllTables(prisma)

    const superRole = await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const superRoleId = superRole.id

    const schoolANew = await prisma.school.create({ data: { name: "Isolation School A" } })
    schoolA.id = schoolANew.id
    const schoolBNew = await prisma.school.create({ data: { name: "Isolation School B" } })
    schoolB.id = schoolBNew.id
    const suspended = await prisma.school.create({
      data: { name: "Suspended School", status: "INACTIVE" },
    })
    schoolSuspended.id = suspended.id

    // Subject + teacher owned by school B.
    const subjectB = await prisma.subject.create({
      data: { schoolId: schoolB.id, code: "BSUB", name: "B Subject" },
    })
    subjectBId = subjectB.id

    const subjectA = await prisma.subject.create({
      data: { schoolId: schoolA.id, code: "ASUB", name: "A Subject" },
    })
    subjectAId = subjectA.id

    const teacherB = await prisma.teacher.create({
      data: {
        schoolId: schoolB.id,
        employeeId: "T-ISOL-B-0001",
        firstName: "Bodin",
        lastName: "Teacher",
        gender: "MALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
        teacherSubjects: { create: { subjectId: subjectBId } },
      },
    })
    teacherBId = teacherB.id

    // School B period slots + a timetable entry.
    const slotB = await prisma.periodSlot.create({
      data: { schoolId: schoolB.id, name: "P1", startTime: "08:00", endTime: "08:45", sortOrder: 1 },
    })
    periodSlotBId = slotB.id

    // School B academic session + class + section for attendance anchoring.
    const sessionB = await prisma.academicSession.create({
      data: {
        schoolId: schoolB.id,
        name: "B Year",
        code: "BY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    const classB = await prisma.class.create({ data: { schoolId: schoolB.id, name: "6", sortOrder: 6 } })
    const sectionB = await prisma.section.create({ data: { classId: classB.id, name: "A" } })

    const timetableEntryB = await prisma.timetableEntry.create({
      data: {
        schoolId: schoolB.id,
        academicSessionId: sessionB.id,
        dayOfWeek: "MONDAY",
        periodSlotId: slotB.id,
        classId: classB.id,
        sectionId: sectionB.id,
        subjectId: subjectBId,
        teacherId: teacherBId,
      },
    })
    timetableEntryBId = timetableEntryB.id

    const studentB = await prisma.student.create({
      data: {
        schoolId: schoolB.id,
        admissionNumber: "ADM-2026-0001",
        firstName: "Bola",
        lastName: "Student",
        dateOfBirth: new Date("2015-05-01T00:00:00.000Z"),
        gender: "FEMALE",
        status: "ACTIVE",
        admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      },
    })
    const enrollmentB = await prisma.studentEnrollment.create({
      data: {
        studentId: studentB.id,
        academicSessionId: sessionB.id,
        classId: classB.id,
        sectionId: sectionB.id,
      },
    })
    const attendanceRecordB = await prisma.attendanceRecord.create({
      data: {
        schoolId: schoolB.id,
        academicSessionId: sessionB.id,
        classId: classB.id,
        sectionId: sectionB.id,
        date: new Date("2026-05-01T00:00:00.000Z"),
        studentId: studentB.id,
        enrollmentId: enrollmentB.id,
        status: "PRESENT",
      },
    })
    attendanceRecordBId = attendanceRecordB.id

    // School A admin — with an ACTIVE membership in A (exercises the
    // membership resolution path) and a SUPER_ADMIN role to prove that even a
    // super admin cannot cross tenant boundaries.
    const userA = await prisma.user.create({
      data: {
        name: "Admin A",
        email: "isolation.a@example.com",
        passwordHash: hashPassword("a-secret-123456"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: superRoleId } } }] },
      },
    })
    await prisma.tenantMembership.create({
      data: { userId: userA.id, schoolId: schoolA.id, roleId: superRoleId, status: "ACTIVE" },
    })

    // School B admin — legacy path (schoolId set, no membership).
    await prisma.user.create({
      data: {
        schoolId: schoolB.id,
        name: "Admin B",
        email: "isolation.b@example.com",
        passwordHash: hashPassword("b-secret-123456"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })

    await login(agentA, "isolation.a@example.com", "a-secret-123456")
    await login(agentB, "isolation.b@example.com", "b-secret-123456")
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  it("requires authentication", async () => {
    const res = await request(app).get("/api/v1/teachers")
    expect(res.status).toBe(401)
  })

  describe("cross-tenant read via direct ID", () => {
    it("a user in school A cannot read school B's teacher by direct ID (404)", async () => {
      const res = await agentA.get(`/api/v1/teachers/${teacherBId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("a user in school A cannot list school B's teachers", async () => {
      const res = await agentA.get("/api/v1/teachers")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
    })

    it("a user in school B can still read its own teacher (sanity)", async () => {
      const res = await agentB.get(`/api/v1/teachers/${teacherBId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.employeeId).toBe("T-ISOL-B-0001")
    })
  })

  describe("cross-tenant write (Finding 1 regression)", () => {
    it("updating a foreign teacher by direct ID is rejected (404)", async () => {
      const res = await agentA
        .patch(`/api/v1/teachers/${teacherBId}`)
        .send({ designation: "Hacked" })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("linking a foreign subject to a teacher is rejected (400)", async () => {
      // Admin B owns the teacher; a subject from school A must be refused.
      const res = await agentB
        .patch(`/api/v1/teachers/${teacherBId}`)
        .send({ subjectIds: [subjectAId] })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("linking a teacher's own school subject succeeds (sanity)", async () => {
      const res = await agentB
        .patch(`/api/v1/teachers/${teacherBId}`)
        .send({ subjectIds: [subjectBId] })
      expect(res.status).toBe(200)
    })
  })

  describe("cross-tenant timetable", () => {
    it("a user in school A cannot read school B's timetable entry (404)", async () => {
      const res = await agentA.get(`/api/v1/timetable/${timetableEntryBId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("a user in school A cannot list school B's timetable entries", async () => {
      const res = await agentA.get("/api/v1/timetable")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
    })

    it("a user in school A cannot create an entry referencing school B's period slot (400)", async () => {
      // Fields that pass zod (schema-valid UUIDs) but reference resources outside
      // school A. The service's foreign-key validation rejects the create with
      // BAD_REQUEST before any row is inserted — schoolId is always derived from
      // req.auth, so school B's period slot is unreachable from school A.
      const res = await agentA.post("/api/v1/timetable").send({
        academicSessionId: "00000000-0000-4000-8000-000000000001",
        dayOfWeek: "MONDAY",
        periodSlotId: periodSlotBId,
        classId: "00000000-0000-4000-8000-000000000002",
        sectionId: null,
        subjectId: subjectAId,
        teacherId: "00000000-0000-4000-8000-000000000003",
      })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("a user in school B can still read its own timetable entry (sanity)", async () => {
      const res = await agentB.get(`/api/v1/timetable/${timetableEntryBId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(timetableEntryBId)
    })
  })

  describe("cross-tenant attendance", () => {
    it("a user in school A cannot read school B's attendance record (404)", async () => {
      const res = await agentA.get(`/api/v1/attendance/${attendanceRecordBId}`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("a user in school A cannot list school B's attendance records", async () => {
      const res = await agentA.get("/api/v1/attendance")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(0)
    })

    it("a user in school A cannot update school B's attendance record (404)", async () => {
      const res = await agentA.patch(`/api/v1/attendance/${attendanceRecordBId}`).send({ status: "ABSENT" })
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })

    it("a user in school B can still read its own attendance record (sanity)", async () => {
      const res = await agentB.get(`/api/v1/attendance/${attendanceRecordBId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(attendanceRecordBId)
    })
  })

  describe("membership resolution", () => {
    it("explicitly selecting a school the user does not belong to is forbidden (403)", async () => {
      const res = await agentA
        .get("/api/v1/teachers")
        .set("x-school-id", schoolB.id)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("selecting the user's own school succeeds (200)", async () => {
      const res = await agentA
        .get("/api/v1/teachers")
        .set("x-school-id", schoolA.id)
      expect(res.status).toBe(200)
    })
  })

  describe("tenant suspension", () => {
    it("a user whose school is INACTIVE is rejected (403)", async () => {
      const suspendedAdmin = await prisma.user.create({
        data: {
          schoolId: schoolSuspended.id,
          name: "Suspended Admin",
          email: "isolation.suspended@example.com",
          passwordHash: hashPassword("s-secret-123456"),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
        },
      })
      const agent = request.agent(app)
      await login(agent, "isolation.suspended@example.com", "s-secret-123456")

      const res = await agent.get("/api/v1/teachers")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
      expect(suspendedAdmin).toBeDefined()
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.staff.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.subject.deleteMany()
  await prisma.section.deleteMany()
  await prisma.class.deleteMany()
  await prisma.session.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.tenantMembership.deleteMany()
  await prisma.academicSession.deleteMany()
  await prisma.user.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
  await prisma.school.deleteMany()
}

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}
