import { execFileSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { env } from "../src/config/env.js"
import { getStorage } from "../src/lib/storage/index.js"

// Profile photos: upload/replace/remove/serve, tenant isolation, content
// validation (rejects non-images), and audit recording — all against the real
// object storage (local provider) and DB. DB-gated like the other integration
// suites. Storage objects are written under `server/uploads` and removed in
// afterAll.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const PHOTO_PERMS = [
  "students:view",
  "students:update",
  "teachers:view",
  "teachers:update",
  "staff:view",
  "staff:update",
]

describe.skipIf(!TEST_DATABASE_URL)("profile photos (integration)", () => {
  let prisma: PrismaClient

  const schoolA = { id: "" }
  const schoolB = { id: "" }

  let studentAId = ""
  let teacherAId = ""
  let staffAId = ""
  let studentBId = ""

  const trackedKeys: string[] = []

  const adminAAgent = request.agent(app)
  const adminBAgent = request.agent(app)
  const helperAgent = request.agent(app)

  async function makePng(width = 120, height = 120): Promise<Buffer> {
    const sharp = (await import("sharp")).default
    return sharp({
      create: { width, height, channels: 3, background: { r: 210, g: 60, b: 120 } },
    })
      .png()
      .toBuffer()
  }

  async function pngFormat(buffer: Buffer): Promise<string | undefined> {
    const sharp = (await import("sharp")).default
    try {
      const meta = await sharp(buffer).metadata()
      return meta.format
    } catch {
      return undefined
    }
  }

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for this suite")

    execFileSync(process.execPath, [
      "node_modules/prisma/build/index.js",
      "migrate",
      "deploy",
      "--schema",
      "server/prisma/schema.prisma",
    ], { env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL }, stdio: "pipe" })

    prisma = new PrismaClient()
    await resetAllTables(prisma)

    const adminRole = await prisma.role.create({
      data: { name: "SCHOOL_ADMIN", description: "Test tenant admin" },
    })
    for (const code of PHOTO_PERMS) {
      const [resource, action] = code.split(":")
      await prisma.permission.create({ data: { code, resource, action, description: code } })
    }
    const perms = await prisma.permission.findMany({ where: { code: { in: PHOTO_PERMS } } })
    await prisma.rolePermission.createMany({
      data: perms.map((p) => ({ roleId: adminRole.id, permissionId: p.id })),
    })
    // A role with no permissions so 403 (not 404) is exercised for the helper.
    const noPermRole = await prisma.role.create({
      data: { name: "NO_PERMS", description: "Test role without photo permissions" },
    })

    const a = await prisma.school.create({ data: { name: "Photo School A" } })
    schoolA.id = a.id
    const b = await prisma.school.create({ data: { name: "Photo School B" } })
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

    await createMember("photo.admin.a@example.com", "Admin A", schoolA.id, adminRole.id)
    await createMember("photo.admin.b@example.com", "Admin B", schoolB.id, adminRole.id)
    await createMember("photo.helper@example.com", "Helper", schoolA.id, noPermRole.id)

    await login(adminAAgent, "photo.admin.a@example.com", "password-123456")
    await login(adminBAgent, "photo.admin.b@example.com", "password-123456")
    await login(helperAgent, "photo.helper@example.com", "password-123456")

    const createStudent = async (schoolId: string, firstName: string) => {
      const s = await prisma.student.create({
        data: {
          schoolId,
          admissionNumber: `ADM-${firstName.toUpperCase()}`,
          firstName,
          dateOfBirth: new Date("2015-01-01"),
          gender: "FEMALE",
          admissionDate: new Date("2026-01-10"),
        },
      })
      return s.id
    }
    studentAId = await createStudent(schoolA.id, "Alice")
    studentBId = await createStudent(schoolB.id, "Betty")
    teacherAId = await prisma.teacher.create({
      data: {
        schoolId: schoolA.id,
        employeeId: "TCH-2026-0001",
        firstName: "Grace",
        gender: "FEMALE",
        designation: "Mathematics Teacher",
        joiningDate: new Date("2026-01-15"),
        status: "ACTIVE",
      },
    }).then((t) => t.id)
    staffAId = await prisma.staff.create({
      data: {
        schoolId: schoolA.id,
        employeeId: "STF-2026-0001",
        firstName: "Harold",
        lastName: "Staff",
        gender: "MALE",
        department: "Administration",
        designation: "Office Assistant",
        joiningDate: new Date("2026-02-01"),
        status: "ACTIVE",
      },
    }).then((s) => s.id)
  })

  afterAll(async () => {
    try {
      const storage = getStorage()
      for (const key of trackedKeys) {
        try {
          await storage.remove(key)
        } catch {
          // best-effort cleanup
        }
      }
    } finally {
      await resetAllTables(prisma)
      await prisma?.$disconnect()
    }
  })

  describe("authentication and authorization", () => {
    it("rejects unauthenticated access with 401 on every photo route", async () => {
      const png = await makePng()
      expect((await request(app).get(`/api/v1/students/${studentAId}/photo`)).status).toBe(401)
      expect(
        (await request(app).put(`/api/v1/students/${studentAId}/photo`).attach("photo", png, "avatar.png"))
          .status,
      ).toBe(401)
      expect((await request(app).delete(`/api/v1/students/${studentAId}/photo`)).status).toBe(401)
    })

    it("rejects authenticated users without the permission with 403", async () => {
      const png = await makePng()
      expect((await helperAgent.get(`/api/v1/students/${studentAId}/photo`)).status).toBe(403)
      expect(
        (await helperAgent.put(`/api/v1/students/${studentAId}/photo`).attach("photo", png, "a.png")).status,
      ).toBe(403)
      expect((await helperAgent.delete(`/api/v1/students/${studentAId}/photo`)).status).toBe(403)
    })
  })

  describe("upload and serve", () => {
    it("uploads a student photo, persists the key, and records an audit row", async () => {
      const png = await makePng()
      const res = await adminAAgent
        .put(`/api/v1/students/${studentAId}/photo`)
        .attach("photo", png, "avatar.png")

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const key = res.body.data.photoUrl as string
      expect(key).toMatch(new RegExp(`^photos/${schoolA.id}/students/[0-9a-f-]{36}\\.png$`))
      trackedKeys.push(key)

      const stored = await prisma.student.findFirst({ where: { id: studentAId } })
      expect(stored?.photoUrl).toBe(key)

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: studentAId, entityType: "STUDENT", action: "UPDATE" },
        orderBy: { createdAt: "desc" },
      })
      expect(audit).not.toBeNull()
      expect(audit?.summary).toContain("profile photo for student")
    })

    it("serves the uploaded photo via the authenticated route with a private cache header", async () => {
      const res = await adminAAgent.get(`/api/v1/students/${studentAId}/photo`)
      expect(res.status).toBe(200)
      expect(res.headers["content-type"]).toContain("image/png")
      expect(res.headers["cache-control"]).toContain("private")
      expect(await pngFormat(res.body)).toBe("png")
    })

    it("returns 404 when the entity has no photo", async () => {
      const res = await adminAAgent.get(`/api/v1/teachers/${teacherAId}/photo`)
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe("NOT_FOUND")
    })
  })

  describe("replace and remove", () => {
    it("replaces the photo with a new key and drops the old object", async () => {
      const first = await prisma.student.findFirst({ where: { id: studentAId } })
      const firstKey = first?.photoUrl

      const replaced = await adminAAgent
        .put(`/api/v1/students/${studentAId}/photo`)
        .attach("photo", await makePng(200, 200), "avatar2.png")
      expect(replaced.status).toBe(200)
      const secondKey = replaced.body.data.photoUrl as string
      expect(secondKey).not.toBe(firstKey)
      trackedKeys.push(secondKey)

      const stored = await prisma.student.findFirst({ where: { id: studentAId } })
      expect(stored?.photoUrl).toBe(secondKey)

      const storage = getStorage()
      expect(await storage.get(firstKey!)).toBeNull()
      expect(await storage.get(secondKey)).not.toBeNull()
    })

    it("removes the photo (DB reference cleared, object deleted, 404 afterwards)", async () => {
      const removed = await adminAAgent.delete(`/api/v1/students/${studentAId}/photo`)
      expect(removed.status).toBe(200)
      expect(removed.body.data.photoUrl).toBeNull()

      const stored = await prisma.student.findFirst({ where: { id: studentAId } })
      expect(stored?.photoUrl).toBeNull()

      const serve = await adminAAgent.get(`/api/v1/students/${studentAId}/photo`)
      expect(serve.status).toBe(404)

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: studentAId, entityType: "STUDENT", action: "DELETE" },
        orderBy: { createdAt: "desc" },
      })
      expect(audit).not.toBeNull()
      expect(audit?.summary).toContain("photo for student")
    })
  })

  describe("tenant isolation", () => {
    it("school B cannot read, write, or serve school A photos (404, never leaks)", async () => {
      expect((await adminBAgent.get(`/api/v1/students/${studentAId}/photo`)).status).toBe(404)
      const put = await adminBAgent
        .put(`/api/v1/students/${studentAId}/photo`)
        .attach("photo", await makePng(), "x.png")
      expect(put.status).toBe(404)
      expect((await adminBAgent.delete(`/api/v1/students/${studentAId}/photo`)).status).toBe(404)
    })

    it("school B can still upload and serve its own tenant's photos", async () => {
      const put = await adminBAgent
        .put(`/api/v1/students/${studentBId}/photo`)
        .attach("photo", await makePng(), "own.png")
      expect(put.status).toBe(200)
      const key = put.body.data.photoUrl as string
      expect(key).toContain(`photos/${schoolB.id}/students/`)
      trackedKeys.push(key)

      const serve = await adminBAgent.get(`/api/v1/students/${studentBId}/photo`)
      expect(serve.status).toBe(200)
      expect(serve.headers["content-type"]).toContain("image/png")
    })
  })

  describe("content validation", () => {
    it("rejects non-image bytes with 400 even when the client claims a PNG", async () => {
      const res = await adminAAgent
        .put(`/api/v1/teachers/${teacherAId}/photo`)
        .attach("photo", Buffer.from("definitely not a png"), { filename: "fake.png", contentType: "image/png" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })

    it("rejects uploads over the size limit with 400", async () => {
      const tooBig = Buffer.alloc(env.upload.maxSizeBytes + 1024, 0x62)
      const res = await adminAAgent
        .put(`/api/v1/staff/${staffAId}/photo`)
        .attach("photo", tooBig, "big.png")
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.staff.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.student.deleteMany()
  await prisma.teacher.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.tenantMembership.deleteMany()
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