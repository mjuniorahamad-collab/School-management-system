import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { PrismaClient } from "@prisma/client"
import request from "supertest"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { createApp } from "../src/app.js"
import { hashPassword } from "../src/auth/password.js"
import { SUPER_ADMIN_ROLE } from "../src/permissions/permissions.js"

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const app = createApp()

const LIBRARY_PERMISSIONS = [
  { code: "library:view", resource: "library", action: "view" },
  { code: "library:create", resource: "library", action: "create" },
  { code: "library:update", resource: "library", action: "update" },
  { code: "library:issue", resource: "library", action: "issue" },
  { code: "library:return", resource: "library", action: "return" },
] as const

const fixtures = {
  schoolId: "",
  otherSchoolId: "",
  adminPassword: "library-admin-secret",
}

// Date-anchored fixtures stay relative to the run date (AGENTS.md §16) so a
// freshly issued loan always has a future due date regardless of when the
// suite runs.
const LOAN_ISSUE_DAY = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
const LOAN_DUE_DAY = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)

describe.skipIf(!TEST_DATABASE_URL)("Library API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const librarianAgent = request.agent(app)
  const viewerAgent = request.agent(app)
  const clerkAgent = request.agent(app)

  const student = { id: "", inactiveStudentId: "" }
  const teacher = { id: "" }
  const staff = { id: "" }

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

    const school = await prisma.school.create({ data: { name: "Library School" } })
    fixtures.schoolId = school.id
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } })
    fixtures.otherSchoolId = otherSchool.id

    // Borrowers (ACTIVE plus one inactive student for the borrower gate test).
    const s = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "LIB-ADM-0001",
        firstName: "Grace",
        lastName: "Hopper",
        dateOfBirth: new Date("2014-01-01T00:00:00.000Z"),
        gender: "FEMALE",
        status: "ACTIVE",
        admissionDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    })
    student.id = s.id
    const inactive = await prisma.student.create({
      data: {
        schoolId: school.id,
        admissionNumber: "LIB-ADM-0002",
        firstName: "Hypatia",
        lastName: "Inactive",
        dateOfBirth: new Date("2014-01-01T00:00:00.000Z"),
        gender: "FEMALE",
        status: "INACTIVE",
        admissionDate: new Date("2026-01-01T00:00:00.000Z"),
      },
    })
    student.inactiveStudentId = inactive.id
    const t = await prisma.teacher.create({
      data: {
        schoolId: school.id,
        employeeId: "LIB-T-100",
        firstName: "Ada",
        lastName: "Byron",
        email: "ada.library@example.com",
        gender: "FEMALE",
        designation: "Librarian",
        status: "ACTIVE",
        joiningDate: new Date("2024-01-01T00:00:00.000Z"),
      },
    })
    teacher.id = t.id
    const sf = await prisma.staff.create({
      data: {
        schoolId: school.id,
        employeeId: "LIB-S-200",
        firstName: "Barbara",
        lastName: "Clerk",
        email: "barbara.staff@example.com",
        gender: "FEMALE",
        department: "Library",
        designation: "Clerk",
        status: "ACTIVE",
        joiningDate: new Date("2024-01-01T00:00:00.000Z"),
      },
    })
    staff.id = sf.id

    // Roles: SUPER_ADMIN bypasses; LIBRARIAN has full library access; VIEWER can
    // only read; CLERK has nothing.
    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const librarianRole = await prisma.role.create({ data: { name: "LIBRARIAN_TEST", description: "Library staff" } })
    const viewerRole = await prisma.role.create({ data: { name: "VIEWER_TEST", description: "Read-only" } })
    const clerkRole = await prisma.role.create({ data: { name: "CLERK_TEST", description: "No library access" } })

    for (const permission of LIBRARY_PERMISSIONS) {
      const row = await prisma.permission.create({ data: permission })
      if (permission.code === "library:view") {
        await prisma.rolePermission.create({ data: { roleId: viewerRole.id, permissionId: row.id } })
      }
      await prisma.rolePermission.create({ data: { roleId: librarianRole.id, permissionId: row.id } })
    }

    async function createUser(name: string, email: string, roleId: string, password: string) {
      const user = await prisma.user.create({
        data: {
          schoolId: school.id,
          name,
          email,
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { id: roleId } } }] },
        },
      })
      await prisma.tenantMembership.create({
        data: { userId: user.id, schoolId: school.id, roleId, status: "ACTIVE" },
      })
      return user
    }

    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: SUPER_ADMIN_ROLE },
      select: { id: true },
    })
    await createUser("Library Admin", "library.admin@example.com", superAdminRole.id, fixtures.adminPassword)
    await createUser("Librarian One", "librarian.one@example.com", librarianRole.id, "librarian-secret-123")
    await createUser("Viewer One", "viewer.one@example.com", viewerRole.id, "viewer-secret-123")
    await createUser("Clerk One", "clerk.one@example.com", clerkRole.id, "clerk-secret-123")

    await login(adminAgent, "library.admin@example.com", fixtures.adminPassword)
    await login(librarianAgent, "librarian.one@example.com", "librarian-secret-123")
    await login(viewerAgent, "viewer.one@example.com", "viewer-secret-123")
    await login(clerkAgent, "clerk.one@example.com", "clerk-secret-123")
  })

  afterEach(async () => {
    await prisma.libraryLoan.deleteMany()
    await prisma.libraryCopy.deleteMany()
    await prisma.libraryBook.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.school.update({
      where: { id: fixtures.schoolId },
      data: { libraryCopyCounter: 1 },
    })
    await prisma.libraryBook.deleteMany({ where: { schoolId: fixtures.otherSchoolId } })
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  async function givenCopy(
    overrides: { status?: "AVAILABLE" | "ISSUED" | "LOST" | "MAINTENANCE"; schoolId?: string } = {},
  ) {
    const schoolId = overrides.schoolId ?? fixtures.schoolId
    const title = `Book ${randomUUID().slice(0, 8)}`
    const book = await prisma.libraryBook.create({
      data: { schoolId, title, author: "Test Author" },
    })
    const copy = await prisma.libraryCopy.create({
      data: {
        schoolId,
        bookId: book.id,
        copyCode: `${schoolId === fixtures.otherSchoolId ? "OTHER" : "LIB"}-${randomUUID().slice(0, 8)}`,
        status: overrides.status ?? "AVAILABLE",
      },
    })
    return { book, copy }
  }

  function issuePayload(copyId: string, overrides: Record<string, unknown> = {}) {
    return {
      copyId,
      borrowerType: "STUDENT",
      borrowerId: student.id,
      issueDate: LOAN_ISSUE_DAY,
      dueDate: LOAN_DUE_DAY,
      ...overrides,
    }
  }

  describe("RBAC and authentication", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/library/books")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies a role without any library permission", async () => {
      const res = await clerkAgent.get("/api/v1/library/books")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("allows a viewers-only role to read but not create or issue", async () => {
      const list = await viewerAgent.get("/api/v1/library/books")
      expect(list.status).toBe(200)
      const create = await viewerAgent.post("/api/v1/library/books").send({ title: "X", author: "Y" })
      expect(create.status).toBe(403)
      const { copy } = await givenCopy()
      const issue = await viewerAgent.post("/api/v1/library/loans").send(issuePayload(copy.id))
      expect(issue.status).toBe(403)
    })

    it("grants the librarian create/update/issue/return", async () => {
      const res = await librarianAgent.post("/api/v1/library/books").send({
        title: "Pride and Prejudice",
        author: "Jane Austen",
      })
      expect(res.status).toBe(201)
    })
  })

  describe("books CRUD and listing", () => {
    it("creates a book, normalizing the ISBN and defaulting category/active", async () => {
      const res = await adminAgent.post("/api/v1/library/books").send({
        title: "  The Night Book  ",
        author: "Author A",
        isbn: "  978-0-06 112008-4 ",
      })
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.title).toBe("The Night Book")
      expect(data.isbn).toBe("978-0-06112008-4")
      expect(data.category).toBe("OTHER")
      expect(data.isActive).toBe(true)
      expect(data.copies).toEqual({ AVAILABLE: 0, ISSUED: 0, LOST: 0, MAINTENANCE: 0 })
    })

    it("rejects a duplicate ISBN within the same school", async () => {
      await adminAgent.post("/api/v1/library/books").send({ title: "One", author: "A", isbn: "1111111111111" })
      const res = await adminAgent.post("/api/v1/library/books").send({ title: "Two", author: "B", isbn: "1111 111 111111" })
      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe("BAD_REQUEST")
      expect(res.body.error.message).toContain("ISBN")
    })

    it("allows the same ISBN in a different school", async () => {
      await adminAgent.post("/api/v1/library/books").send({ title: "A", author: "B", isbn: "2222222222222" })
      await prisma.libraryBook.create({
        data: {
          schoolId: fixtures.otherSchoolId,
          title: "A",
          author: "B",
          isbn: "2222222222222",
        },
      })
      const res = await adminAgent.post("/api/v1/library/books").send({ title: "A2", author: "B2", isbn: "2222222222222" })
      expect(res.status).toBe(400) // same school again
      const otherBook = await prisma.libraryBook.findFirst({ where: { schoolId: fixtures.otherSchoolId } })
      expect(otherBook?.isbn).toBe("2222222222222")
    })

    it("lists, searches and filters books with copy counts", async () => {
      await adminAgent.post("/api/v1/library/books").send({ title: "Catcher in the Rye", author: "J.D. Salinger", category: "FICTION" })
      await adminAgent.post("/api/v1/library/books").send({ title: "Physics Primer", author: "Dr. Fields", category: "TEXTBOOK" })
      const second = await prisma.libraryBook.findFirst({ where: { title: "Physics Primer" } })
      await prisma.libraryCopy.create({
        data: { schoolId: fixtures.schoolId, bookId: second!.id, copyCode: "LIB-CNT-1", status: "AVAILABLE" },
      })

      const all = await adminAgent.get("/api/v1/library/books")
      expect(all.status).toBe(200)
      expect(all.body.data.pagination.total).toBe(2)
      expect(all.body.data.pagination.totalPages).toBe(1)

      const fiction = await adminAgent.get("/api/v1/library/books?category=FICTION")
      expect(fiction.body.data.pagination.total).toBe(1)
      expect(fiction.body.data.items[0].title).toBe("Catcher in the Rye")

      const search = await adminAgent.get("/api/v1/library/books?search=salinger")
      expect(search.body.data.pagination.total).toBe(1)
      expect(search.body.data.items[0].totalCopies).toBe(0)

      const searchByCode = await adminAgent.get("/api/v1/library/books?search=Physics")
      expect(searchByCode.body.data.pagination.total).toBe(1)
      expect(searchByCode.body.data.items[0].availableCopies).toBe(1)
    })

    it("gets a book detail and its copy counts", async () => {
      const created = await adminAgent.post("/api/v1/library/books").send({ title: "Detail Book", author: "A" })
      const id = created.body.data.id
      await prisma.libraryCopy.create({
        data: { schoolId: fixtures.schoolId, bookId: id, copyCode: "LIB-DET-1", status: "AVAILABLE" },
      })
      await prisma.libraryCopy.create({
        data: { schoolId: fixtures.schoolId, bookId: id, copyCode: "LIB-DET-2", status: "ISSUED" },
      })
      const res = await adminAgent.get(`/api/v1/library/books/${id}`)
      expect(res.status).toBe(200)
      expect(res.body.data.copies).toEqual({ AVAILABLE: 1, ISSUED: 1, LOST: 0, MAINTENANCE: 0 })
      expect(res.body.data.totalCopies).toBe(2)
    })

    it("updates a book and detects the change in the audit diff", async () => {
      const created = await adminAgent.post("/api/v1/library/books").send({ title: "Update Me", author: "A", isbn: "3333333333333" })
      const id = created.body.data.id
      const res = await adminAgent.patch(`/api/v1/library/books/${id}`).send({ title: "Updated", isActive: false })
      expect(res.status).toBe(200)
      expect(res.body.data.title).toBe("Updated")
      expect(res.body.data.isActive).toBe(false)

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "UPDATE", entityType: "LIBRARY_BOOK", entityId: id },
      })
      expect(audit).not.toBeNull()
      const fields = audit!.diff as { fields: Array<{ field: string }> }
      expect(fields.fields.map((f) => f.field)).toEqual(expect.arrayContaining(["title", "isActive"]))
    })

    it("returns 404 for cross-tenant and unknown books", async () => {
      const otherBook = await prisma.libraryBook.create({
        data: { schoolId: fixtures.otherSchoolId, title: "Foreign Book", author: "X" },
      })
      const foreign = await adminAgent.get(`/api/v1/library/books/${otherBook.id}`)
      expect(foreign.status).toBe(404)
      const foreignPatch = await adminAgent.patch(`/api/v1/library/books/${otherBook.id}`).send({ title: "Nope" })
      expect(foreignPatch.status).toBe(404)
      const unknown = await adminAgent.get("/api/v1/library/books/ffffffff-ffff-ffff-ffff-ffffffffffff")
      expect(unknown.status).toBe(404)
    })
  })

  describe("copies", () => {
    it("creates serialized copy codes from the per-school counter", async () => {
      const book = await adminAgent.post("/api/v1/library/books").send({ title: "Serial Codes", author: "A" })
      const bookId = book.body.data.id
      const first = await adminAgent.post("/api/v1/library/copies").send({ bookId })
      const second = await adminAgent.post("/api/v1/library/copies").send({ bookId })
      expect(first.status).toBe(201)
      expect(first.body.data.copyCode).toBe("LIB-0001")
      expect(first.body.data.bookTitle).toBe("Serial Codes")
      expect(second.body.data.copyCode).toBe("LIB-0002")
    })

    it("lists copies for a book and rejects a cross-tenant bookId", async () => {
      const created = await adminAgent.post("/api/v1/library/books").send({ title: "Copy List Book", author: "A" })
      const bookId = created.body.data.id
      await adminAgent.post("/api/v1/library/copies").send({ bookId })
      const res = await adminAgent.get(`/api/v1/library/copies?bookId=${bookId}`)
      expect(res.status).toBe(200)
      expect(res.body.data.items).toHaveLength(1)
      expect(res.body.data.total).toBe(1)

      const otherBook = await prisma.libraryBook.create({
        data: { schoolId: fixtures.otherSchoolId, title: "Foreign", author: "F" },
      })
      const foreign = await adminAgent.get(`/api/v1/library/copies?bookId=${otherBook.id}`)
      expect(foreign.status).toBe(404)
    })

    it("allows AVAILABLE <-> LOST/MAINTENANCE status transitions", async () => {
      const { copy } = await givenCopy()
      const lost = await adminAgent.patch(`/api/v1/library/copies/${copy.id}/status`).send({ status: "LOST", note: "misplaced" })
      expect(lost.status).toBe(200)
      expect(lost.body.data.status).toBe("LOST")
      expect(lost.body.data.note).toBe("misplaced")
      const back = await adminAgent.patch(`/api/v1/library/copies/${copy.id}/status`).send({ status: "AVAILABLE" })
      expect(back.body.data.status).toBe("AVAILABLE")
    })

    it("rejects setting ISSUED directly and flipping an on-loan copy", async () => {
      const { copy } = await givenCopy()
      const direct = await adminAgent.patch(`/api/v1/library/copies/${copy.id}/status`).send({ status: "ISSUED" })
      expect(direct.status).toBe(400)

      await prisma.libraryLoan.create({
        data: {
          schoolId: fixtures.schoolId,
          copyId: copy.id,
          borrowerType: "STUDENT",
          borrowerId: student.id,
          borrowerName: "Grace Hopper",
          borrowerCode: "LIB-ADM-0001",
          issuedAt: new Date("2026-09-01T00:00:00.000Z"),
          dueAt: new Date("2026-09-15T00:00:00.000Z"),
        },
      })
      await prisma.libraryCopy.update({ where: { id: copy.id }, data: { status: "ISSUED" } })
      const flip = await adminAgent.patch(`/api/v1/library/copies/${copy.id}/status`).send({ status: "AVAILABLE" })
      expect(flip.status).toBe(400)
      expect(flip.body.error.message).toContain("returned")
    })
  })

  describe("borrowers", () => {
    it("lists only ACTIVE students, teachers and staff and searches by name", async () => {
      const students = await adminAgent.get("/api/v1/library/borrowers?type=STUDENT")
      expect(students.status).toBe(200)
      expect(students.body.data.map((b: { name: string }) => b.name)).toEqual(["Grace Hopper"])

      const all = await adminAgent.get("/api/v1/library/borrowers")
      const names = all.body.data.map((b: { name: string }) => b.name)
      expect(names).toEqual(expect.arrayContaining(["Grace Hopper", "Ada Byron", "Barbara Clerk"]))
      expect(names).toHaveLength(3)

      const byCode = await adminAgent.get("/api/v1/library/borrowers?search=LIB-T-100")
      expect(byCode.body.data).toHaveLength(1)
      expect(byCode.body.data[0].type).toBe("TEACHER")
    })
  })

  describe("loans (issue/return)", () => {
    it("issues an available copy to an ACTIVE student with snapshots and audit", async () => {
      const { copy, book } = await givenCopy()
      const res = await adminAgent.post("/api/v1/library/loans").send(issuePayload(copy.id))
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.status).toBe("ON_LOAN")
      expect(data.bookTitle).toBe(book.title)
      expect(data.copyCode).toBe(copy.copyCode)
      expect(data.borrowerName).toBe("Grace Hopper")
      expect(data.borrowerCode).toBe("LIB-ADM-0001")
      expect(data.borrowerType).toBe("STUDENT")
      expect(data.issuedAt).toBe(LOAN_ISSUE_DAY)
      expect(data.dueAt).toBe(LOAN_DUE_DAY)
      expect(data.issuedByName).toBe("Library Admin")

      const copyRow = await prisma.libraryCopy.findUnique({ where: { id: copy.id } })
      expect(copyRow!.status).toBe("ISSUED")

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "ISSUE", entityType: "LIBRARY_LOAN" },
      })
      expect(audit).not.toBeNull()
      expect(audit!.metadata as Record<string, unknown>).toMatchObject({
        bookTitle: book.title,
        copyCode: copy.copyCode,
        dueAt: LOAN_DUE_DAY,
      })
    })

    it("refuses to issue an unavailable or already-on-loan copy", async () => {
      const issued = await givenCopy({ status: "ISSUED" })
      const onIssue = await adminAgent.post("/api/v1/library/loans").send(issuePayload(issued.copy.id))
      expect(onIssue.status).toBe(400)
      expect(onIssue.body.error.message).toContain("not available")

      const lost = await givenCopy({ status: "LOST" })
      const lostIssue = await adminAgent.post("/api/v1/library/loans").send(issuePayload(lost.copy.id))
      expect(lostIssue.status).toBe(400)
    })

    it("requires an ACTIVE borrower in the same school", async () => {
      const { copy } = await givenCopy()
      const inactive = await adminAgent.post("/api/v1/library/loans").send(
        issuePayload(copy.id, { borrowerId: student.inactiveStudentId }),
      )
      expect(inactive.status).toBe(400)
      expect(inactive.body.error.message).toContain("Borrower")

      const { copy: otherCopy } = await givenCopy({ schoolId: fixtures.otherSchoolId })
      const foreign = await adminAgent.post("/api/v1/library/loans").send(issuePayload(otherCopy.id))
      expect(foreign.status).toBe(404)
    })

    it("enforces the five-active-loans cap per borrower", async () => {
      const copies: { id: string }[] = []
      for (let i = 0; i < 5; i += 1) {
        const { copy } = await givenCopy()
        copies.push(copy)
        const res = await adminAgent.post("/api/v1/library/loans").send(issuePayload(copy.id, { dueDate: "2026-09-20" }))
        expect(res.status).toBe(201)
      }
      const { copy: sixth } = await givenCopy()
      const res = await adminAgent.post("/api/v1/library/loans").send(issuePayload(sixth.id))
      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("maximum of 5")
    })

    it("derives OVERDUE status for a past due date", async () => {
      const { copy } = await givenCopy()
      const res = await adminAgent.post("/api/v1/library/loans").send(
        issuePayload(copy.id, { issueDate: "2020-06-01", dueDate: "2020-06-15" }),
      )
      expect(res.status).toBe(201)
      expect(res.body.data.status).toBe("OVERDUE")
    })

    it("lists loans with status filters and search", async () => {
      const { copy, book } = await givenCopy()
      await adminAgent.post("/api/v1/library/loans").send(issuePayload(copy.id))
      await prisma.libraryLoan.updateMany({ data: { returnedAt: new Date("2026-09-05T00:00:00.000Z") } })

      const active = await adminAgent.get("/api/v1/library/loans?status=active")
      expect(active.body.data.pagination.total).toBe(0)
      const returned = await adminAgent.get("/api/v1/library/loans?status=returned")
      expect(returned.body.data.pagination.total).toBe(1)
      const byTitle = await adminAgent.get(`/api/v1/library/loans?search=${encodeURIComponent(book.title)}`)
      expect(byTitle.body.data.pagination.total).toBeGreaterThanOrEqual(1)
    })

    it("returns a loan, re-availablizes the copy and audits the event", async () => {
      const { copy } = await givenCopy()
      const issued = await adminAgent.post("/api/v1/library/loans").send(issuePayload(copy.id))
      const loanId = issued.body.data.id

      const res = await adminAgent.post(`/api/v1/library/loans/${loanId}/return`)
      expect(res.status).toBe(200)
      expect(res.body.data.status).toBe("RETURNED")
      expect(res.body.data.returnedAt).toBeTruthy()
      expect(res.body.data.returnedByName).toBe("Library Admin")

      const copyRow = await prisma.libraryCopy.findUnique({ where: { id: copy.id } })
      expect(copyRow!.status).toBe("AVAILABLE")

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "RETURN", entityType: "LIBRARY_LOAN" },
      })
      expect(audit).not.toBeNull()

      const again = await adminAgent.post(`/api/v1/library/loans/${loanId}/return`)
      expect(again.status).toBe(400)
      expect(again.body.error.message).toContain("already been returned")
    })

    it("re-issues the same copy after return", async () => {
      const { copy } = await givenCopy()
      const issued = await adminAgent.post("/api/v1/library/loans").send(issuePayload(copy.id))
      const loanId = issued.body.data.id
      await adminAgent.post(`/api/v1/library/loans/${loanId}/return`)
      const second = await adminAgent.post("/api/v1/library/loans").send(issuePayload(copy.id))
      expect(second.status).toBe(201)
    })

    it("keeps cross-tenant loans invisible and unreturnable", async () => {
      const foreignCopy = await prisma.libraryCopy.create({
        data: {
          schoolId: fixtures.otherSchoolId,
          bookId: (
            await prisma.libraryBook.create({
              data: { schoolId: fixtures.otherSchoolId, title: "Foreign Loan Book", author: "F" },
            })
          ).id,
          copyCode: "OTHER-0001",
          status: "ISSUED",
        },
      })
      const foreignLoan = await prisma.libraryLoan.create({
        data: {
          schoolId: fixtures.otherSchoolId,
          copyId: foreignCopy.id,
          borrowerType: "STUDENT",
          borrowerId: student.inactiveStudentId,
          borrowerName: "Someone Else",
          borrowerCode: "X",
          issuedAt: new Date("2026-09-01T00:00:00.000Z"),
          dueAt: new Date("2026-09-15T00:00:00.000Z"),
        },
      })
      const list = await adminAgent.get("/api/v1/library/loans")
      expect(list.body.data.items.some((l: { id: string }) => l.id === foreignLoan.id)).toBe(false)
      const ret = await adminAgent.post(`/api/v1/library/loans/${foreignLoan.id}/return`)
      expect(ret.status).toBe(404)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "LibraryLoan" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "LibraryCopy" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "LibraryBook" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.studentGuardian.deleteMany()
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.studentEnrollment.deleteMany()
  await prisma.student.deleteMany()
  await prisma.guardian.deleteMany()
  await prisma.teacherSubject.deleteMany()
  await prisma.teacherClass.deleteMany()
  await prisma.staff.deleteMany()
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