import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

// Phase 2: Settings, master data (FeeHeads/ExamTypes/GradingBands/PeriodSlots),
// Notices and Events — all tenant-scoped. Verifies cross-tenant read/write/
// update isolation, tenant-scoped uniqueness, suspended-tenant rejection,
// notice publish lifecycle / audience, event date validation, and platform
// super admin behavior. DB-gated.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const ADMIN_PERMS = [
  "settings:view",
  "settings:update",
  "fees:view",
  "fees:create",
  "fees:update",
  "exams:view",
  "exams:create",
  "exams:update",
  "timetable:view",
  "timetable:create",
  "timetable:update",
  "results:view",
  "results:create",
  "results:update",
  "notices:view",
  "notices:create",
  "notices:update",
  "notices:delete",
  "events:view",
  "events:create",
  "events:update",
  "events:delete",
]

describe.skipIf(!TEST_DATABASE_URL)("Phase 2 (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  let feeHeadBId = ""
  let examTypeBId = ""
  let gradingBandBId = ""
  let periodSlotBId = ""
  let noticeBId = ""
  let eventBId = ""

  const agentA = request.agent(app)
  const agentB = request.agent(app)
  const platSupAgent = request.agent(app)

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

    // Roles + grants for the SCHOOL_ADMIN tenant admin.
    const superRole = await prisma.role.create({
      data: { name: SUPER_ADMIN_ROLE, description: "Test platform super admin" },
    })
    const schoolAdminRole = await prisma.role.create({
      data: { name: "SCHOOL_ADMIN", description: "Test tenant admin" },
    })
    for (const code of ADMIN_PERMS) {
      const [resource, action] = code.split(":")
      await prisma.permission.create({ data: { code, resource, action, description: code } })
    }
    const perms = await prisma.permission.findMany({ where: { code: { in: ADMIN_PERMS } } })
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: schoolAdminRole.id, permissionId: p.id })),
    })

    const a = await prisma.school.create({ data: { name: "Phase2 School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Phase2 School B" } })
    schoolB.id = b.id

    const createMember = async (
      email: string,
      name: string,
      schoolId: string,
      roleId: string,
    ) => {
      const user = await prisma.user.create({
        data: {
          email,
          name,
          passwordHash: hashPassword("password-123456"),
          status: "ACTIVE",
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId, roleId, status: "ACTIVE" },
      })
      return user.id
    }

    await createMember("admin.a@example.com", "Admin A", schoolA.id, schoolAdminRole.id)
    await createMember("admin.b@example.com", "Admin B", schoolB.id, schoolAdminRole.id)
    await createMember("plat.super@example.com", "Platform Super", schoolA.id, superRole.id)

    await login(agentA, "admin.a@example.com", "password-123456")
    await login(agentB, "admin.b@example.com", "password-123456")
    await login(platSupAgent, "plat.super@example.com", "password-123456")

    // Seed tenant B master data + a notice + an event owned by B.
    const feeHeadB = await prisma.feeHead.create({
      data: { schoolId: schoolB.id, code: "BTU", name: "B Tuition" },
    })
    feeHeadBId = feeHeadB.id
    const examTypeB = await prisma.examType.create({
      data: { schoolId: schoolB.id, code: "BFIN", name: "B Final" },
    })
    examTypeBId = examTypeB.id
    const gradingBandB = await prisma.gradingBand.create({
      data: { schoolId: schoolB.id, minPercent: 90, maxPercent: 100, grade: "A" },
    })
    gradingBandBId = gradingBandB.id
    const periodSlotB = await prisma.periodSlot.create({
      data: { schoolId: schoolB.id, name: "B Period 1", startTime: "08:00", endTime: "08:45" },
    })
    periodSlotBId = periodSlotB.id
    const noticeB = await prisma.notice.create({
      data: {
        schoolId: schoolB.id,
        title: "B Notice",
        body: "B body",
        status: "PUBLISHED",
        audience: "STUDENTS",
        priority: "HIGH",
        publishedAt: new Date(),
      },
    })
    noticeBId = noticeB.id
    const eventB = await prisma.event.create({
      data: {
        schoolId: schoolB.id,
        title: "B Event",
        startAt: new Date("2026-10-01T08:00:00.000Z"),
        endAt: new Date("2026-10-01T12:00:00.000Z"),
        status: "SCHEDULED",
        category: "SPORTS",
      },
    })
    eventBId = eventB.id
  })

  afterAll(async () => {
    await resetAllTables(prisma)
    await prisma?.$disconnect()
  })

  describe("authentication", () => {
    it("rejects unauthenticated access to the new resources", async () => {
      for (const path of ["/settings", "/fee-heads", "/exam-types", "/grading-bands", "/period-slots", "/notices", "/events"]) {
        const res = await request(app).get(`/api/v1${path}`)
        expect(res.status).toBe(401)
      }
    })
  })

  describe("master data — tenant owned content", () => {
    it("tenant A starts empty and can create each master entity", async () => {
      const fh = await agentA.post("/api/v1/fee-heads").send({ code: "ATU", name: "A Tuition", isRecurring: true })
      expect(fh.status).toBe(201)
      expect(fh.body.data.code).toBe("ATU")
      const et = await agentA.post("/api/v1/exam-types").send({ code: "AMB", name: "A Midterm" })
      expect(et.status).toBe(201)
      const gb = await agentA
        .post("/api/v1/grading-bands")
        .send({ minPercent: 75, maxPercent: 89, grade: "B" })
      expect(gb.status).toBe(201)
      const ps = await agentA
        .post("/api/v1/period-slots")
        .send({ name: "A Period 1", startTime: "08:00", endTime: "08:45" })
      expect(ps.status).toBe(201)
    })

    it("tenant A's lists never include tenant B's master data", async () => {
      expect((await agentA.get("/api/v1/fee-heads")).body.data.total).toBe(1)
      expect((await agentA.get("/api/v1/exam-types")).body.data.total).toBe(1)
      expect((await agentA.get("/api/v1/grading-bands")).body.data.total).toBe(1)
      expect((await agentA.get("/api/v1/period-slots")).body.data.total).toBe(1)
      const bFeeHeads = await agentA.get("/api/v1/fee-heads?search=B")
      expect(bFeeHeads.body.data.total).toBe(0)
    })

    it("tenant A cannot read tenant B master data by direct ID (404)", async () => {
      expect((await agentA.get(`/api/v1/fee-heads/${feeHeadBId}`)).status).toBe(404)
      expect((await agentA.get(`/api/v1/exam-types/${examTypeBId}`)).status).toBe(404)
      expect((await agentA.get(`/api/v1/grading-bands/${gradingBandBId}`)).status).toBe(404)
      expect((await agentA.get(`/api/v1/period-slots/${periodSlotBId}`)).status).toBe(404)
    })

    it("tenant A cannot update tenant B master data (404)", async () => {
      const res = await agentA.patch(`/api/v1/fee-heads/${feeHeadBId}`).send({ name: "Hacked" })
      expect(res.status).toBe(404)
    })

    it("tenant-scoped uniqueness: allowed across tenants, rejected within a tenant", async () => {
      // B can also use code ATU (its own namespace).
      const cross = await agentB.post("/api/v1/fee-heads").send({ code: "ATU", name: "B Tuition 2" })
      expect(cross.status).toBe(201)
      // Duplicating ATU within tenant A is rejected.
      const dup = await agentA.post("/api/v1/fee-heads").send({ code: "ATU", name: "Duplicate" })
      expect(dup.status).toBe(400)
      expect(dup.body.error.code).toBe("BAD_REQUEST")
    })

    it("master-data validation returns field-level messages", async () => {
      const badPeriod = await agentA
        .post("/api/v1/period-slots")
        .send({ name: "P", startTime: "10:00", endTime: "09:00" })
      expect(badPeriod.status).toBe(400)
      expect(badPeriod.body.error.code).toBe("VALIDATION_ERROR")
      const badBand = await agentA
        .post("/api/v1/grading-bands")
        .send({ minPercent: 90, maxPercent: 50 })
      expect(badBand.status).toBe(400)
    })

    it("tenant B can still manage its own master data (sanity)", async () => {
      const res = await agentB.patch(`/api/v1/fee-heads/${feeHeadBId}`).send({ name: "B Tuition Updated" })
      expect(res.status).toBe(200)
      expect(res.body.data.name).toBe("B Tuition Updated")
    })
  })

  describe("settings — tenant scoping", () => {
    it("returns settings with the tenant's school info", async () => {
      const res = await agentA.get("/api/v1/settings")
      expect(res.status).toBe(200)
      expect(res.body.data.school.name).toBe("Phase2 School A")
      expect(res.body.data.settings.primaryColor).toBeDefined()
    })

    it("updates tenant A settings and reads them back", async () => {
      const res = await agentA
        .put("/api/v1/settings")
        .send({ schoolName: "Bright Future Intl", feeCurrency: "GBP", gradingPassPercent: 45 })
      expect(res.status).toBe(200)
      expect(res.body.data.settings.feeCurrency).toBe("GBP")
      expect(res.body.data.settings.gradingPassPercent).toBe(45)
    })

    it("tenant A settings do not leak to tenant B", async () => {
      // B seeded defaults, not A's updates.
      const b = await agentB.get("/api/v1/settings")
      expect(b.body.data.settings.feeCurrency).toBe("USD")
      expect(b.body.data.settings.gradingPassPercent).toBe(40)
    })

    it("rejects an invalid setting with a field-level message", async () => {
      const res = await agentA.put("/api/v1/settings").send({ primaryColor: "not-a-color" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })
  })

  describe("notices — lifecycle, audience and isolation", () => {
    it("creates a draft and publishes it (server-stamped publishedAt)", async () => {
      const draft = await agentA
        .post("/api/v1/notices")
        .send({ title: "Holiday", body: "School closed Friday", audience: "PARENTS" })
      expect(draft.status).toBe(201)
      expect(draft.body.data.status).toBe("DRAFT")
      const published = await agentA
        .patch(`/api/v1/notices/${draft.body.data.id}`)
        .send({ status: "PUBLISHED" })
      expect(published.status).toBe(200)
      expect(published.body.data.status).toBe("PUBLISHED")
      expect(published.body.data.publishedAt).toBeTruthy()
    })

    it("lists and filters tenant A notices", async () => {
      const all = await agentA.get("/api/v1/notices")
      expect(all.body.data.total).toBe(1)
      const byAudience = await agentA.get("/api/v1/notices?audience=PARENTS")
      expect(byAudience.body.data.total).toBe(1)
      const studentsOnly = await agentA.get("/api/v1/notices?audience=STUDENTS")
      expect(studentsOnly.body.data.total).toBe(0)
    })

    it("tenant A cannot read tenant B notices (list empty + direct-ID 404)", async () => {
      const list = await agentA.get("/api/v1/notices?search=B%20Notice")
      expect(list.body.data.total).toBe(0)
      const direct = await agentA.get(`/api/v1/notices/${noticeBId}`)
      expect(direct.status).toBe(404)
    })

    it("tenant A cannot update or delete tenant B notices (404)", async () => {
      expect((await agentA.patch(`/api/v1/notices/${noticeBId}`).send({ title: "x" })).status).toBe(404)
      expect((await agentA.delete(`/api/v1/notices/${noticeBId}`)).status).toBe(404)
    })

    it("tenant B can read its own notice (sanity)", async () => {
      const res = await agentB.get(`/api/v1/notices/${noticeBId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe("B Notice")
    })
  })

  describe("events — validation and isolation", () => {
    it("creates an event and lists it in tenant A", async () => {
      const res = await agentA
        .post("/api/v1/events")
        .send({
          title: "Founders Day",
          startAt: "2026-11-20T08:00:00.000Z",
          endAt: "2026-11-20T16:00:00.000Z",
          category: "CULTURAL",
        })
      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe("SCHEDULED")
      const list = await agentA.get("/api/v1/events")
      expect(list.body.data.total).toBe(1)
    })

    it("rejects an event whose end precedes its start (field-level)", async () => {
      const res = await agentA
        .post("/api/v1/events")
        .send({ title: "Bad", startAt: "2026-11-20T16:00:00.000Z", endAt: "2026-11-20T08:00:00.000Z" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("VALIDATION_ERROR")
    })

    it("tenant A cannot read/update/delete tenant B events", async () => {
      expect((await agentA.get(`/api/v1/events/${eventBId}`)).status).toBe(404)
      expect((await agentA.patch(`/api/v1/events/${eventBId}`).send({ title: "x" })).status).toBe(404)
      expect((await agentA.delete(`/api/v1/events/${eventBId}`)).status).toBe(404)
    })

    it("tenant B can read its own event (sanity)", async () => {
      const res = await agentB.get(`/api/v1/events/${eventBId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.category).toBe("SPORTS")
    })
  })

  describe("platform super admin behavior", () => {
    it("platform super admin can manage master data within a tenant", async () => {
      const res = await platSupAgent.post("/api/v1/fee-heads").send({ code: "CANTEEN", name: "Canteen" })
      expect(res.status).toBe(201)
    })

    it("platform super admin can update settings within a tenant", async () => {
      const res = await platSupAgent.put("/api/v1/settings").send({ feeCurrency: "EUR" })
      expect(res.status).toBe(200)
      expect(res.body.data.settings.feeCurrency).toBe("EUR")
    })
  })

  describe("tenant suspension", () => {
    it("a user whose school is INACTIVE is rejected on Phase 2 routes (403)", async () => {
      const suspendedSchool = await prisma.school.create({
        data: { name: "Suspended Phase2", status: "INACTIVE" },
      })
      const user = await prisma.user.create({
        data: {
          schoolId: suspendedSchool.id,
          name: "Suspended Admin",
          email: "phase2.suspended@example.com",
          passwordHash: hashPassword("password-123456"),
          status: "ACTIVE",
        },
      })
      await prisma.tenantMembership.create({
        data: {
          userId: user.id,
          schoolId: suspendedSchool.id,
          roleId: (await prisma.role.findFirstOrThrow({ where: { name: "SCHOOL_ADMIN" } })).id,
          status: "ACTIVE",
        },
      })
      const agent = request.agent(app)
      await login(agent, "phase2.suspended@example.com", "password-123456")
      const res = await agent.get("/api/v1/notices")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.feeStructureItem.deleteMany()
  await prisma.feeStructure.deleteMany()
  await prisma.feeHead.deleteMany()
  await prisma.event.deleteMany()
  await prisma.notice.deleteMany()
  await prisma.schoolSetting.deleteMany()
  await prisma.gradingBand.deleteMany()
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.examType.deleteMany()
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
