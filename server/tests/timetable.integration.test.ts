import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

interface Fixtures {
  schoolId: string
  sessionId: string
  classId: string
  sectionId: string
  sectionBId: string
  otherClassId: string
  otherSectionId: string
  subjectId: string
  teacherId: string
  secondTeacherId: string
  periodSlotId: string
  secondPeriodSlotId: string
  adminPassword: string
}

const fixtures: Fixtures = {
  schoolId: "",
  sessionId: "",
  classId: "",
  sectionId: "",
  sectionBId: "",
  otherClassId: "",
  otherSectionId: "",
  subjectId: "",
  teacherId: "",
  secondTeacherId: "",
  periodSlotId: "",
  secondPeriodSlotId: "",
  adminPassword: "timetable-secret-123",
}

describe.skipIf(!TEST_DATABASE_URL)("Timetable API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const teacherAgent = request.agent(app)
  const noAccessAgent = request.agent(app)

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

    const school = await prisma.school.create({ data: { name: "Timetable School" } })
    fixtures.schoolId = school.id

    const session = await prisma.academicSession.create({
      data: {
        schoolId: school.id,
        name: "Timetable Year",
        code: "TY2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2027-03-31T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.sessionId = session.id

    const cls = await prisma.class.create({
      data: { schoolId: school.id, name: "6", sortOrder: 6 },
    })
    fixtures.classId = cls.id
    const section = await prisma.section.create({ data: { classId: cls.id, name: "A" } })
    fixtures.sectionId = section.id
    const sectionB = await prisma.section.create({ data: { classId: cls.id, name: "B" } })
    fixtures.sectionBId = sectionB.id

    const otherClass = await prisma.class.create({
      data: { schoolId: school.id, name: "9", sortOrder: 9 },
    })
    fixtures.otherClassId = otherClass.id
    const otherSection = await prisma.section.create({
      data: { classId: otherClass.id, name: "A" },
    })
    fixtures.otherSectionId = otherSection.id

    const subject = await prisma.subject.create({
      data: { schoolId: school.id, code: "MAT", name: "Mathematics" },
    })
    fixtures.subjectId = subject.id

    const teacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "T-TT-0001",
        firstName: "Tim",
        lastName: "Timetable",
        gender: "MALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.teacherId = teacher.id

    const secondTeacher = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "T-TT-0002",
        firstName: "Rita",
        lastName: "Reader",
        gender: "FEMALE",
        designation: "Teacher",
        joiningDate: new Date("2026-04-01T00:00:00.000Z"),
        status: "ACTIVE",
      },
    })
    fixtures.secondTeacherId = secondTeacher.id

    const slot = await prisma.periodSlot.create({
      data: {
        schoolId: school.id,
        name: "Period 1",
        startTime: "08:00",
        endTime: "08:45",
        sortOrder: 1,
      },
    })
    fixtures.periodSlotId = slot.id

    const secondSlot = await prisma.periodSlot.create({
      data: {
        schoolId: school.id,
        name: "Period 2",
        startTime: "08:45",
        endTime: "09:30",
        sortOrder: 2,
      },
    })
    fixtures.secondPeriodSlotId = secondSlot.id

    const superAdminRole = await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const teacherRole = await prisma.role.create({ data: { name: "TEACHER", description: "Test teacher" } })
    // A role with no timetable permissions at all, used to prove that the
    // permission guard denies access before the ownership rules are reached.
    const noAccessRole = await prisma.role.create({ data: { name: "NO_TIMETABLE_ACCESS", description: "Test no access" } })

    // The teacher needs the real timetable permissions, otherwise every teacher
    // request would be rejected by the permission guard and the ownership rules
    // below could never be reached.
    for (const code of ["timetable:view", "timetable:create", "timetable:update", "timetable:delete"]) {
      const [resource, action] = code.split(":")
      const permission = await prisma.permission.create({
        data: { code, resource, action, description: `Test ${code}` },
      })
      await prisma.rolePermission.create({ data: { roleId: teacherRole.id, permissionId: permission.id } })
    }

    const adminUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Timetable Admin",
        email: "timetable.admin@example.com",
        passwordHash: hashPassword(fixtures.adminPassword),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { name: SUPER_ADMIN_ROLE } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: adminUser.id, schoolId: school.id, roleId: superAdminRole.id, status: "ACTIVE" } })

    const teacherUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Timetable Teacher",
        email: "timetable.teacher@example.com",
        passwordHash: hashPassword("teacher-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: teacherRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: teacherUser.id, schoolId: school.id, roleId: teacherRole.id, status: "ACTIVE" } })
    // Link the account to the teacher profile so the acting-teacher resolution
    // (and therefore the ownership rules) can be exercised.
    await prisma.teacher.update({ where: { id: teacher.id }, data: { userId: teacherUser.id } })

    const noAccessUser = await prisma.user.create({
      data: {
        schoolId: school.id,
        name: "Timetable Observer",
        email: "timetable.observer@example.com",
        passwordHash: hashPassword("observer-secret-123"),
        status: "ACTIVE",
        roles: { create: [{ role: { connect: { id: noAccessRole.id } } }] },
      },
    })
    await prisma.tenantMembership.create({ data: { userId: noAccessUser.id, schoolId: school.id, roleId: noAccessRole.id, status: "ACTIVE" } })

    await login(adminAgent, "timetable.admin@example.com", fixtures.adminPassword)
    await login(teacherAgent, "timetable.teacher@example.com", "teacher-secret-123")
    await login(noAccessAgent, "timetable.observer@example.com", "observer-secret-123")
  })

  afterEach(async () => {
    await prisma.timetableEntry.deleteMany()
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  function entryPayload(overrides: Record<string, unknown> = {}) {
    return {
      academicSessionId: fixtures.sessionId,
      dayOfWeek: "MONDAY",
      periodSlotId: fixtures.periodSlotId,
      classId: fixtures.classId,
      sectionId: fixtures.sectionId,
      subjectId: fixtures.subjectId,
      teacherId: fixtures.teacherId,
      ...overrides,
    }
  }

  describe("index", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/timetable")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("returns an empty list before any entries exist", async () => {
      const res = await adminAgent.get("/api/v1/timetable")
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.items).toEqual([])
      expect(res.body.data.total).toBe(0)
    })

    it("denies a role without the timetable:view permission", async () => {
      const res = await noAccessAgent.get("/api/v1/timetable")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })

  describe("multi-entry day/period slots", () => {
    it("returns both entries when two sections share the same day and period", async () => {
      const first = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      expect(first.status).toBe(201)
      const second = await adminAgent.post("/api/v1/timetable").send(
        entryPayload({
          sectionId: fixtures.sectionBId,
          teacherId: fixtures.secondTeacherId,
        }),
      )
      expect(second.status).toBe(201)

      const res = await adminAgent.get("/api/v1/timetable")
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(2)

      const ids = res.body.data.items.map((item: { id: string }) => item.id)
      expect(new Set(ids).size).toBe(2)
      expect(ids).toContain(first.body.data.id)
      expect(ids).toContain(second.body.data.id)
      for (const item of res.body.data.items) {
        expect(item.dayOfWeek).toBe("MONDAY")
        expect(item.periodSlotId).toBe(fixtures.periodSlotId)
      }
    })

    it("returns both entries when two classes share the same day and period", async () => {
      const first = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      expect(first.status).toBe(201)
      const second = await adminAgent.post("/api/v1/timetable").send(
        entryPayload({
          classId: fixtures.otherClassId,
          sectionId: fixtures.otherSectionId,
          teacherId: fixtures.secondTeacherId,
        }),
      )
      expect(second.status).toBe(201)

      const res = await adminAgent.get("/api/v1/timetable")
      expect(res.body.data.total).toBe(2)
      const classNames = res.body.data.items
        .map((item: { className: string }) => item.className)
        .sort()
      expect(classNames).toEqual(["6", "9"])
    })

    it("filters the list by classId", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      await adminAgent.post("/api/v1/timetable").send(
        entryPayload({
          classId: fixtures.otherClassId,
          sectionId: fixtures.otherSectionId,
          teacherId: fixtures.secondTeacherId,
        }),
      )

      const res = await adminAgent.get(`/api/v1/timetable?classId=${fixtures.classId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(1)
      expect(res.body.data.items[0].classId).toBe(fixtures.classId)
    })

    it("filters the list by sectionId", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      await adminAgent.post("/api/v1/timetable").send(
        entryPayload({
          sectionId: fixtures.sectionBId,
          teacherId: fixtures.secondTeacherId,
        }),
      )

      const res = await adminAgent.get(`/api/v1/timetable?sectionId=${fixtures.sectionBId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.total).toBe(1)
      expect(res.body.data.items[0].sectionId).toBe(fixtures.sectionBId)
    })

    it("orders entries by day and then by period slot order", async () => {
      await adminAgent.post("/api/v1/timetable").send(
        entryPayload({ periodSlotId: fixtures.secondPeriodSlotId }),
      )
      await adminAgent.post("/api/v1/timetable").send(entryPayload({ dayOfWeek: "TUESDAY" }))
      await adminAgent.post("/api/v1/timetable").send(entryPayload())

      const res = await adminAgent.get("/api/v1/timetable")
      expect(res.status).toBe(200)
      const slots = res.body.data.items.map(
        (item: { dayOfWeek: string; periodSlotId: string }) => [item.dayOfWeek, item.periodSlotId],
      )
      expect(slots).toEqual([
        ["MONDAY", fixtures.periodSlotId],
        ["MONDAY", fixtures.secondPeriodSlotId],
        ["TUESDAY", fixtures.periodSlotId],
      ])
    })
  })

  describe("create", () => {
    it("creates a timetable entry with nested names", async () => {
      const res = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      const data = res.body.data
      expect(data.dayOfWeek).toBe("MONDAY")
      expect(data.periodSlotName).toBe("Period 1")
      expect(data.className).toBe("6")
      expect(data.sectionName).toBe("A")
      expect(data.subjectName).toBe("Mathematics")
      expect(data.teacherName).toBe("Tim Timetable")
    })

    it("allows a whole-class entry with sectionId null", async () => {
      const res = await adminAgent.post("/api/v1/timetable").send(entryPayload({ sectionId: null }))
      expect(res.status).toBe(201)
      expect(res.body.data.sectionName).toBeNull()
    })

    it("rejects a section that does not belong to the class", async () => {
      const foreignSection = await prisma.section.create({
        data: {
          classId: (
            await prisma.class.create({ data: { schoolId: fixtures.schoolId, name: "7", sortOrder: 7 } })
          ).id,
          name: "B",
        },
      })
      const res = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ sectionId: foreignSection.id }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects a foreign-key reference (unknown subject)", async () => {
      const res = await adminAgent
        .post("/api/v1/timetable")
        .send(
          entryPayload({ subjectId: "ffffffff-ffff-ffff-ffff-ffffffffffff" }),
        )
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects an unknown period slot", async () => {
      const res = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ periodSlotId: "ffffffff-ffff-ffff-ffff-ffffffffffff" }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/period slot/i)
    })

    it("rejects a period slot from another school", async () => {
      const otherSchool = await prisma.school.create({ data: { name: "Foreign School" } })
      const foreignSlot = await prisma.periodSlot.create({
        data: {
          schoolId: otherSchool.id,
          name: "Foreign Slot",
          startTime: "09:00",
          endTime: "09:45",
          sortOrder: 1,
        },
      })
      const res = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ periodSlotId: foreignSlot.id }))
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/period slot/i)
    })

    it("rejects a duplicate class+period on the same day with a conflict message", async () => {
      await adminAgent.post("/api/v1/timetable").send(
        entryPayload({ subjectId: (
          await prisma.subject.create({ data: { schoolId: fixtures.schoolId, code: "ENG", name: "English" } })
        ).id }),
      )
      const res = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/class/i)
    })

    it("rejects a duplicate teacher+period on the same day", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const otherClass = await prisma.class.create({
        data: { schoolId: fixtures.schoolId, name: "8", sortOrder: 8 },
      })
      const res = await adminAgent.post("/api/v1/timetable").send(
        entryPayload({ classId: otherClass.id, sectionId: null }),
      )
      expect(res.status).toBe(400)
      expect(res.body.error.message).toMatch(/teacher/i)
    })
  })

  describe("detail / get", () => {
    it("gets an entry by id with nested names", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.id).toBe(id)
      expect(res.body.data.teacherName).toBe("Tim Timetable")
    })

    it("returns 404 for an unknown id", async () => {
      const res = await adminAgent.get("/api/v1/timetable/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("update", () => {
    it("moves an entry to another day", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent.patch(`/api/v1/timetable/${id}`).send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(200)
      expect(res.body.data.dayOfWeek).toBe("FRIDAY")
    })

    it("returns 404 when updating an unknown entry", async () => {
      const res = await adminAgent
        .patch("/api/v1/timetable/ffffffff-ffff-ffff-ffff-ffffffffffff")
        .send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(404)
    })

    it("rejects moving an entry to an unknown period slot", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent
        .patch(`/api/v1/timetable/${id}`)
        .send({ periodSlotId: "ffffffff-ffff-ffff-ffff-ffffffffffff" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toMatch(/period slot/i)
    })

    // Teacher ownership on UPDATE (the same rule the delete path applies).
    it("refuses to update another teacher's entry", async () => {
      const created = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ teacherId: fixtures.secondTeacherId }))
      const id = created.body.data.id

      const res = await teacherAgent.patch(`/api/v1/timetable/${id}`).send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")

      // The entry must still be unchanged.
      const after = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(after.status).toBe(200)
      expect(after.body.data.dayOfWeek).toBe("MONDAY")
    })

    it("refuses to hand another teacher's entry over to somebody else", async () => {
      const created = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ teacherId: fixtures.secondTeacherId }))
      const id = created.body.data.id

      const res = await teacherAgent
        .patch(`/api/v1/timetable/${id}`)
        .send({ teacherId: fixtures.teacherId })
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")

      const after = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(after.body.data.teacherId).toBe(fixtures.secondTeacherId)
    })

    it("lets a teacher update their own entry", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id

      const res = await teacherAgent.patch(`/api/v1/timetable/${id}`).send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(200)
      expect(res.body.data.dayOfWeek).toBe("FRIDAY")
    })

    it("keeps an administrator's update unrestricted", async () => {
      const created = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ teacherId: fixtures.secondTeacherId }))
      const id = created.body.data.id

      const res = await adminAgent.patch(`/api/v1/timetable/${id}`).send({ dayOfWeek: "FRIDAY" })
      expect(res.status).toBe(200)
      expect(res.body.data.dayOfWeek).toBe("FRIDAY")
    })
  })

  describe("delete", () => {
    it("deletes an entry", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      const res = await adminAgent.delete(`/api/v1/timetable/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const after = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(after.status).toBe(404)
    })

    it("returns 404 when deleting an entry that does not exist", async () => {
      const res = await adminAgent.delete("/api/v1/timetable/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(res.status).toBe(404)
    })

    it("records an audit log entry for the delete", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id
      await adminAgent.delete(`/api/v1/timetable/${id}`)

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "TIMETABLE_ENTRY", entityId: id },
      })
      expect(audit).not.toBeNull()
      expect(audit?.action).toBe("DELETE")
      expect(audit?.schoolId).toBe(fixtures.schoolId)
    })

    it("refuses to delete another teacher's entry", async () => {
      const created = await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ teacherId: fixtures.secondTeacherId }))
      const id = created.body.data.id

      const res = await teacherAgent.delete(`/api/v1/timetable/${id}`)
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")

      // The entry must still be there.
      const after = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(after.status).toBe(200)
    })

    it("lets a teacher delete their own entry", async () => {
      const created = await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const id = created.body.data.id

      const res = await teacherAgent.delete(`/api/v1/timetable/${id}`)
      expect(res.status).toBe(200)
      const after = await adminAgent.get(`/api/v1/timetable/${id}`)
      expect(after.status).toBe(404)
    })
  })

  describe("copy-day", () => {
    it("copies entries from one day to another and reports the count", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      const res = await adminAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      })
      expect(res.status).toBe(200)
      expect(res.body.data.copied).toBe(1)
      expect(res.body.data.skipped).toBe(0)
      const tuesday = await adminAgent.get("/api/v1/timetable?dayOfWeek=TUESDAY")
      expect(tuesday.body.data.total).toBe(1)
    })

    // A conflicting lesson on the target day is silently dropped by
    // `skipDuplicates`. The skipped count makes that visible instead of
    // pretending the whole day moved.
    it("reports how many lessons were skipped because the target slot was taken", async () => {
      // Rita already teaches class A in Period 1 on TUESDAY.
      await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ dayOfWeek: "TUESDAY", teacherId: fixtures.secondTeacherId }))
      // Tim's MONDAY lesson would land on the same class+slot on TUESDAY. A
      // teacher copy only replaces their OWN lessons, so Rita's row survives
      // and the copied lesson conflicts with it.
      await adminAgent.post("/api/v1/timetable").send(entryPayload())

      const res = await teacherAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      })
      expect(res.status).toBe(200)
      expect(res.body.data.copied).toBe(0)
      expect(res.body.data.skipped).toBe(1)
    })

    it("records the skipped count in the audit metadata", async () => {
      await adminAgent
        .post("/api/v1/timetable")
        .send(entryPayload({ dayOfWeek: "TUESDAY", teacherId: fixtures.secondTeacherId }))
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      await teacherAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      })

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: "TIMETABLE_ENTRY",
          action: "UPDATE",
          summary: { contains: "copied timetable day", mode: "insensitive" },
        },
        // The audit log is not cleared between tests — take the newest entry.
        orderBy: { createdAt: "desc" },
      })
      expect(audit).not.toBeNull()
      const metadata = (audit?.metadata ?? {}) as { copied?: number; skipped?: number }
      expect(metadata.copied).toBe(0)
      expect(metadata.skipped).toBe(1)
    })

    it("rejects copying a day onto itself", async () => {
      const res = await adminAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "MONDAY",
      })
      expect(res.status).toBe(400)
    })

    it("records an audit log entry for the copy", async () => {
      await adminAgent.post("/api/v1/timetable").send(entryPayload())
      await adminAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      })

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: "TIMETABLE_ENTRY",
          action: "UPDATE",
          summary: { contains: "copied timetable day", mode: "insensitive" },
        },
      })
      expect(audit).not.toBeNull()
      expect(audit?.schoolId).toBe(fixtures.schoolId)
    })

    it("never deletes another teacher's lessons on the target day", async () => {
      // Rita (another teacher) already has a lesson on TUESDAY, in a different
      // period slot so the copy below cannot conflict with it.
      await adminAgent
        .post("/api/v1/timetable")
        .send(
          entryPayload({
            dayOfWeek: "TUESDAY",
            periodSlotId: fixtures.secondPeriodSlotId,
            teacherId: fixtures.secondTeacherId,
          }),
        )
      // Tim's own lesson on MONDAY is what the teacher copies.
      await adminAgent.post("/api/v1/timetable").send(entryPayload())

      const res = await teacherAgent.post("/api/v1/timetable/copy-day").send({
        academicSessionId: fixtures.sessionId,
        sourceDay: "MONDAY",
        targetDay: "TUESDAY",
      })
      expect(res.status).toBe(200)
      expect(res.body.data.copied).toBe(1)

      const tuesday = await adminAgent.get("/api/v1/timetable?dayOfWeek=TUESDAY")
      // Rita's lesson survived and Tim's copy was added.
      expect(tuesday.body.data.total).toBe(2)
      const teacherIds = tuesday.body.data.items.map((item: { teacherId: string }) => item.teacherId)
      expect(teacherIds).toContain(fixtures.secondTeacherId)
      expect(teacherIds).toContain(fixtures.teacherId)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  // One TRUNCATE ... CASCADE clears every school-scoped table AND the rows that
  // RESTRICT a delete (payments, receipts, adjustments, enrolments, ...). An
  // ordered list of DELETEs aborts as soon as a previously run suite left a
  // Restrict child behind: the DB-backed suites share ONE test database and
  // run one after another.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "School" CASCADE')
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
}

async function login(
  agent: ReturnType<typeof request.agent>,
  email: string,
  password: string,
): Promise<void> {
  const res = await agent.post("/api/v1/auth/login").send({ email, password })
  expect(res.status).toBe(200)
}
