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

const TRANSPORT_PERMISSIONS = [
  { code: "transport:view", resource: "transport", action: "view" },
  { code: "transport:create", resource: "transport", action: "create" },
  { code: "transport:update", resource: "transport", action: "update" },
  { code: "transport:delete", resource: "transport", action: "delete" },
] as const

const fixtures = {
  schoolId: "",
  otherSchoolId: "",
  adminPassword: "transport-admin-secret",
}

describe.skipIf(!TEST_DATABASE_URL)("Transport API (integration)", () => {
  let prisma: PrismaClient
  const adminAgent = request.agent(app)
  const managerAgent = request.agent(app)
  const viewerAgent = request.agent(app)
  const noAccessAgent = request.agent(app)

  const students = {
    activeA: "",
    activeB: "",
    activeC: "",
    inactive: "",
  }
  const staff = { active: "", inactive: "" }
  const sessions = { active: "", upcoming: "", closed: "" }

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

    const school = await prisma.school.create({ data: { name: "Transport School" } })
    fixtures.schoolId = school.id
    const otherSchool = await prisma.school.create({ data: { name: "Other School" } })
    fixtures.otherSchoolId = otherSchool.id

    async function student(name: string, admission: string, status: string) {
      const row = await prisma.student.create({
        data: {
          schoolId: school.id,
          admissionNumber: admission,
          firstName: name,
          dateOfBirth: new Date("2014-01-01T00:00:00.000Z"),
          gender: "FEMALE",
          status: status as "ACTIVE" | "INACTIVE",
          admissionDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      })
      return row.id
    }
    students.activeA = await student("Amara", "TRP-ADM-0001", "ACTIVE")
    students.activeB = await student("Binta", "TRP-ADM-0002", "ACTIVE")
    students.activeC = await student("Carla", "TRP-ADM-0003", "ACTIVE")
    students.inactive = await student("Dara", "TRP-ADM-0004", "INACTIVE")

    async function staffRow(name: string, employeeId: string, status: string) {
      const row = await prisma.staff.create({
        data: {
          schoolId: school.id,
          employeeId,
          firstName: name,
          email: `${employeeId.toLowerCase()}@example.com`,
          gender: "MALE",
          department: "Transport",
          designation: "Driver",
          status: status as "ACTIVE" | "INACTIVE",
          joiningDate: new Date("2024-01-01T00:00:00.000Z"),
        },
      })
      return row.id
    }
    staff.active = await staffRow("Kevin", "TRP-S-001", "ACTIVE")
    staff.inactive = await staffRow("Liam", "TRP-S-002", "INACTIVE")

    async function session(name: string, code: string, status: string) {
      const row = await prisma.academicSession.create({
        data: {
          schoolId: school.id,
          name,
          code,
          startDate: new Date("2026-01-05T00:00:00.000Z"),
          endDate: new Date("2026-12-18T00:00:00.000Z"),
          status: status as "ACTIVE" | "UPCOMING" | "CLOSED",
        },
      })
      return row.id
    }
    sessions.active = await session("Term 1 2026", "T1-2026", "ACTIVE")
    sessions.upcoming = await session("Term 2 2026", "T2-2026", "UPCOMING")
    sessions.closed = await session("Term 3 2025", "T3-2025", "CLOSED")

    // Roles: SUPER_ADMIN bypasses; MANAGER has full transport access; VIEWER can
    // read; NO_ACCESS has nothing.
    await prisma.role.create({ data: { name: SUPER_ADMIN_ROLE, description: "Test super admin" } })
    const managerRole = await prisma.role.create({ data: { name: "TRANSPORT_MANAGER_TEST", description: "Transport staff" } })
    const viewerRole = await prisma.role.create({ data: { name: "TRANSPORT_VIEWER_TEST", description: "Read-only" } })
    const noAccessRole = await prisma.role.create({ data: { name: "TRANSPORT_NONE_TEST", description: "No access" } })

    for (const permission of TRANSPORT_PERMISSIONS) {
      const row = await prisma.permission.create({ data: permission })
      if (permission.code === "transport:view") {
        await prisma.rolePermission.create({ data: { roleId: viewerRole.id, permissionId: row.id } })
      }
      await prisma.rolePermission.create({ data: { roleId: managerRole.id, permissionId: row.id } })
    }

    async function createUser(name: string, email: string, roleId: string, password: string) {
      return prisma.user.create({
        data: {
          schoolId: school.id,
          name,
          email,
          passwordHash: hashPassword(password),
          status: "ACTIVE",
          roles: { create: [{ role: { connect: { id: roleId } } }] },
        },
      })
    }

    const superAdminRole = await prisma.role.findUniqueOrThrow({
      where: { name: SUPER_ADMIN_ROLE },
      select: { id: true },
    })
    await createUser("Transport Admin", "transport.admin@example.com", superAdminRole.id, fixtures.adminPassword)
    await createUser("Manager One", "transport.manager@example.com", managerRole.id, "manager-secret-123")
    await createUser("Viewer One", "transport.viewer@example.com", viewerRole.id, "viewer-secret-123")
    await createUser("None One", "transport.none@example.com", noAccessRole.id, "none-secret-123")

    await login(adminAgent, "transport.admin@example.com", fixtures.adminPassword)
    await login(managerAgent, "transport.manager@example.com", "manager-secret-123")
    await login(viewerAgent, "transport.viewer@example.com", "viewer-secret-123")
    await login(noAccessAgent, "transport.none@example.com", "none-secret-123")
  })

  afterEach(async () => {
    await prisma.transportAssignment.deleteMany()
    await prisma.transportDriver.deleteMany()
    await prisma.transportStop.deleteMany()
    await prisma.transportRoute.deleteMany()
    await prisma.transportVehicle.deleteMany()
    await prisma.auditLog.deleteMany()
    await prisma.school.update({
      where: { id: fixtures.schoolId },
      data: { transportVehicleCounter: 1 },
    })
  })

  afterAll(async () => {
    await prisma?.$disconnect()
  })

  async function givenVehicle(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent
      .post("/api/v1/transport/vehicles")
      .send({ registrationNumber: `KCA ${randomUUID().slice(0, 4)}`, capacity: 40, ...overrides })
    expect(res.status).toBe(201)
    return res.body.data as {
      id: string
      registrationNumber: string
      vehicleCode: string
      capacity: number
      isActive: boolean
      routeName: string | null
      seatsUsed: number
    }
  }

  async function givenRoute(overrides: Record<string, unknown> = {}) {
    const res = await adminAgent
      .post("/api/v1/transport/routes")
      .send({ name: `Route ${randomUUID().slice(0, 6)}`, ...overrides })
    expect(res.status).toBe(201)
    return res.body.data as {
      id: string
      name: string
      vehicleId: string | null
      vehicleCapacity: number | null
      stops: Array<{ id: string; name: string }>
    }
  }

  async function givenStop(routeId: string, name: string) {
    const res = await adminAgent.post(`/api/v1/transport/routes/${routeId}/stops`).send({ name })
    expect(res.status).toBe(201)
    return res.body.data as { id: string; name: string; sortOrder: number }
  }

  function assignmentPayload(overrides: Record<string, unknown> = {}) {
    return {
      studentId: students.activeA,
      academicSessionId: sessions.active,
      direction: "TO_SCHOOL",
      ...overrides,
    }
  }

  describe("RBAC and authentication", () => {
    it("requires an authenticated session", async () => {
      const res = await request(app).get("/api/v1/transport/vehicles")
      expect(res.status).toBe(401)
      expect(res.body.error.code).toBe("UNAUTHORIZED")
    })

    it("denies a role without any transport permission", async () => {
      const res = await noAccessAgent.get("/api/v1/transport/vehicles")
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe("FORBIDDEN")
    })

    it("allows a viewer role to read but not create or update", async () => {
      const list = await viewerAgent.get("/api/v1/transport/vehicles")
      expect(list.status).toBe(200)
      const create = await viewerAgent.post("/api/v1/transport/vehicles").send({ registrationNumber: "KCA-VIEW-1", capacity: 20 })
      expect(create.status).toBe(403)
      const vehicle = await givenVehicle()
      const patch = await viewerAgent.patch(`/api/v1/transport/vehicles/${vehicle.id}`).send({ isActive: false })
      expect(patch.status).toBe(403)
    })

    it("grants the manager create/update", async () => {
      const create = await managerAgent.post("/api/v1/transport/vehicles").send({ registrationNumber: "KCA-MGR-1", capacity: 20 })
      expect(create.status).toBe(201)
      const patch = await managerAgent.patch(`/api/v1/transport/vehicles/${create.body.data.id}`).send({ notes: "main" })
      expect(patch.status).toBe(200)
    })
  })

  describe("vehicles", () => {
    it("creates vehicles with serialized codes, normalized registration and audit", async () => {
      const first = await givenVehicle({ registrationNumber: "  kca 123 a " })
      expect(first.vehicleCode).toBe("VEH-0001")
      expect(first.registrationNumber).toBe("KCA123A")
      expect(first.isActive).toBe(true)
      expect(first.seatsUsed).toBe(0)

      const second = await givenVehicle()
      expect(second.vehicleCode).toBe("VEH-0002")

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "CREATE", entityType: "TRANSPORT_VEHICLE", entityId: first.id },
      })
      expect(audit).not.toBeNull()
      expect(audit!.metadata as Record<string, unknown>).toMatchObject({
        registrationNumber: first.registrationNumber,
        capacity: 40,
      })
    })

    it("rejects a duplicate registration number", async () => {
      const vehicle = await givenVehicle()
      const res = await adminAgent.post("/api/v1/transport/vehicles").send({
        registrationNumber: `  ${vehicle.registrationNumber.toLowerCase()}  `,
        capacity: 20,
      })
      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("registration number")
    })

    it("lists, searches and filters vehicles", async () => {
      await givenVehicle({ registrationNumber: "KCA BUS-ONE", type: "BUS" })
      await givenVehicle({ registrationNumber: "KCA VAN-ONE", type: "VAN", capacity: 14 })

      const all = await adminAgent.get("/api/v1/transport/vehicles")
      expect(all.status).toBe(200)
      expect(all.body.data.pagination.total).toBe(2)

      const buses = await adminAgent.get("/api/v1/transport/vehicles?type=BUS")
      expect(buses.body.data.pagination.total).toBe(1)
      expect(buses.body.data.items[0].registrationNumber).toBe("KCABUS-ONE")

      const search = await adminAgent.get("/api/v1/transport/vehicles?search=van")
      expect(search.body.data.pagination.total).toBe(1)
    })

    it("updates a vehicle and records the diff in the audit log", async () => {
      const vehicle = await givenVehicle()
      const res = await adminAgent.patch(`/api/v1/transport/vehicles/${vehicle.id}`).send({
        notes: "serviced",
        isActive: false,
      })
      expect(res.status).toBe(200)
      expect(res.body.data.notes).toBe("serviced")
      expect(res.body.data.isActive).toBe(false)

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "UPDATE", entityType: "TRANSPORT_VEHICLE", entityId: vehicle.id },
      })
      const fields = audit!.diff as { fields: Array<{ field: string }> }
      expect(fields.fields.map((f) => f.field)).toEqual(expect.arrayContaining(["notes", "isActive"]))
    })

    it("rejects lowering capacity below the seats currently in use", async () => {
      const vehicle = await givenVehicle({ capacity: 2 })
      const route = await givenRoute({ vehicleId: vehicle.id })
      const stop = await givenStop(route.id, "Stop A")
      await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeA, routeId: route.id, stopId: stop.id }),
      )
      await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeB, routeId: route.id, stopId: stop.id }),
      )

      const down = await adminAgent.patch(`/api/v1/transport/vehicles/${vehicle.id}`).send({ capacity: 1 })
      expect(down.status).toBe(400)
      expect(down.body.error.message).toContain("cannot be lowered")

      const up = await adminAgent.patch(`/api/v1/transport/vehicles/${vehicle.id}`).send({ capacity: 60 })
      expect(up.status).toBe(200)
    })

    it("keeps cross-tenant vehicles invisible and uneditable", async () => {
      const foreign = await prisma.transportVehicle.create({
        data: {
          schoolId: fixtures.otherSchoolId,
          registrationNumber: "KCA-OTHER-1",
          vehicleCode: "VEH-9999",
          capacity: 40,
        },
      })
      const get = await adminAgent.get(`/api/v1/transport/vehicles/${foreign.id}`)
      expect(get.status).toBe(404)
      const patch = await adminAgent.patch(`/api/v1/transport/vehicles/${foreign.id}`).send({ notes: "nope" })
      expect(patch.status).toBe(404)
    })
  })

  describe("routes and stops", () => {
    it("creates a route with a vehicle and lists it with counts", async () => {
      const vehicle = await givenVehicle()
      const created = await adminAgent.post("/api/v1/transport/routes").send({
        name: "North Route",
        code: "NR-1",
        vehicleId: vehicle.id,
      })
      expect(created.status).toBe(201)
      expect(created.body.data.vehicleRegistration).toBe(vehicle.registrationNumber)
      expect(created.body.data.vehicleCapacity).toBe(40)
      expect(created.body.data.stops).toEqual([])

      await givenStop(created.body.data.id, "Gate One")
      await givenStop(created.body.data.id, "Gate Two")

      const list = await adminAgent.get("/api/v1/transport/routes")
      expect(list.status).toBe(200)
      expect(list.body.data.items[0].stopCount).toBe(2)
      expect(list.body.data.items[0].driverCount).toBe(0)

      const detail = await adminAgent.get(`/api/v1/transport/routes/${created.body.data.id}`)
      expect(detail.body.data.stops).toHaveLength(2)
      expect(detail.body.data.stops[0].sortOrder).toBe(1)
      expect(detail.body.data.stops[1].sortOrder).toBe(2)
    })

    it("rejects assigning the same vehicle to two routes and an inactive vehicle", async () => {
      const vehicle = await givenVehicle()
      await givenRoute({ vehicleId: vehicle.id })
      const second = await adminAgent.post("/api/v1/transport/routes").send({
        name: "Twin Route",
        vehicleId: vehicle.id,
      })
      expect(second.status).toBe(400)
      expect(second.body.error.message).toContain("already assigned")

      await adminAgent.patch(`/api/v1/transport/vehicles/${vehicle.id}`).send({ isActive: false })
      const onInactive = await adminAgent.post("/api/v1/transport/routes").send({
        name: "Inactive Vehicle Route",
        vehicleId: vehicle.id,
      })
      expect(onInactive.status).toBe(400)
      expect(onInactive.body.error.message).toContain("is not active")
    })

    it("rejects a duplicate stop name on the same route", async () => {
      const route = await givenRoute()
      await givenStop(route.id, "Memorial")
      const duplicate = await adminAgent.post(`/api/v1/transport/routes/${route.id}/stops`).send({ name: "Memorial" })
      expect(duplicate.status).toBe(400)
      expect(duplicate.body.error.message).toContain("already exists")
    })

    it("reorders stops and persists the new sequence", async () => {
      const route = await givenRoute()
      const first = await givenStop(route.id, "First")
      const second = await givenStop(route.id, "Second")
      const third = await givenStop(route.id, "Third")

      const moved = await adminAgent.patch(`/api/v1/transport/routes/${route.id}/stops/${third.id}`).send({ sortOrder: 0 })
      expect(moved.status).toBe(200)
      expect(moved.body.data.sortOrder).toBe(1)

      const detail = await adminAgent.get(`/api/v1/transport/routes/${route.id}`)
      expect(detail.body.data.stops.map((s: { name: string }) => s.name)).toEqual(["Third", "First", "Second"])
      const orphan = await prisma.transportStop.findUnique({ where: { id: first.id } })
      expect(orphan!.sortOrder).toBe(2)
      expect((await prisma.transportStop.findUnique({ where: { id: second.id } }))!.sortOrder).toBe(3)
    })

    it("renames a stop and updates route metadata with audit diff", async () => {
      const route = await givenRoute()
      const stop = await givenStop(route.id, "Old Name")

      const renamed = await adminAgent.patch(`/api/v1/transport/routes/${route.id}/stops/${stop.id}`).send({ name: "New Name" })
      expect(renamed.status).toBe(200)
      expect(renamed.body.data.name).toBe("New Name")

      const updated = await adminAgent.patch(`/api/v1/transport/routes/${route.id}`).send({ description: "express service" })
      expect(updated.status).toBe(200)
      expect(updated.body.data.description).toBe("express service")

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "UPDATE", entityType: "TRANSPORT_ROUTE", entityId: route.id },
      })
      const fields = audit!.diff as { fields: Array<{ field: string }> }
      expect(fields.fields.map((f) => f.field)).toContain("description")
    })

    it("swaps and clears a route vehicle, respecting capacity", async () => {
      const small = await givenVehicle({ capacity: 2 })
      const route = await givenRoute({ vehicleId: small.id })
      const stop = await givenStop(route.id, "Stop S")
      const first = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeA, routeId: route.id, stopId: stop.id }),
      )
      expect(first.status).toBe(201)
      const second = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeB, routeId: route.id, stopId: stop.id }),
      )
      expect(second.status).toBe(201)

      const big = await givenVehicle({ capacity: 60 })
      const swap = await adminAgent.patch(`/api/v1/transport/routes/${route.id}`).send({ vehicleId: big.id })
      expect(swap.status).toBe(200)
      expect(swap.body.data.vehicleRegistration).toBe(big.registrationNumber)

      const tiny = await givenVehicle({ capacity: 1 })
      const underCapacity = await adminAgent.patch(`/api/v1/transport/routes/${route.id}`).send({ vehicleId: tiny.id })
      expect(underCapacity.status).toBe(400)
      expect(underCapacity.body.error.message).toContain("needs at least")

      const cleared = await adminAgent.patch(`/api/v1/transport/routes/${route.id}`).send({ vehicleId: null })
      expect(cleared.status).toBe(200)
      expect(cleared.body.data.vehicleId).toBeNull()
    })

    it("keeps cross-tenant routes invisible", async () => {
      const foreignRoute = await prisma.transportRoute.create({
        data: { schoolId: fixtures.otherSchoolId, name: "Foreign Route" },
      })
      const get = await adminAgent.get(`/api/v1/transport/routes/${foreignRoute.id}`)
      expect(get.status).toBe(404)
      const patch = await adminAgent.patch(`/api/v1/transport/routes/${foreignRoute.id}`).send({ name: "Nope" })
      expect(patch.status).toBe(404)
      const stop = await adminAgent.post(`/api/v1/transport/routes/${foreignRoute.id}/stops`).send({ name: "X" })
      expect(stop.status).toBe(404)
    })
  })

  describe("drivers", () => {
    it("creates a driver from an ACTIVE staff member with a default role label", async () => {
      const res = await adminAgent.post("/api/v1/transport/drivers").send({ staffId: staff.active })
      expect(res.status).toBe(201)
      expect(res.body.data.staffName).toBe("Kevin")
      expect(res.body.data.employeeId).toBe("TRP-S-001")
      expect(res.body.data.roleLabel).toBe("Driver")
      expect(res.body.data.isActive).toBe(true)

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "CREATE", entityType: "TRANSPORT_DRIVER" },
      })
      expect(audit).not.toBeNull()
      expect((audit!.metadata as Record<string, unknown>).staffId).toBe(staff.active)
    })

    it("rejects inactive or unknown staff and duplicate staff", async () => {
      const inactive = await adminAgent.post("/api/v1/transport/drivers").send({ staffId: staff.inactive })
      expect(inactive.status).toBe(400)
      expect(inactive.body.error.message).toContain("not active")

      const unknown = await adminAgent.post("/api/v1/transport/drivers").send({ staffId: "ffffffff-ffff-ffff-ffff-ffffffffffff" })
      expect(unknown.status).toBe(400)

      await adminAgent.post("/api/v1/transport/drivers").send({ staffId: staff.active })
      const duplicate = await adminAgent.post("/api/v1/transport/drivers").send({ staffId: staff.active })
      expect(duplicate.status).toBe(400)
    })

    it("assigns a route, updates and clears it", async () => {
      const route = await givenRoute()
      const driver = await adminAgent.post("/api/v1/transport/drivers").send({ staffId: staff.active, routeId: route.id })
      expect(driver.body.data.routeName).toBe(route.name)

      const other = await givenRoute()
      const updated = await adminAgent.patch(`/api/v1/transport/drivers/${driver.body.data.id}`).send({ routeId: other.id })
      expect(updated.status).toBe(200)
      expect(updated.body.data.routeName).toBe(other.name)

      const cleared = await adminAgent.patch(`/api/v1/transport/drivers/${driver.body.data.id}`).send({ routeId: null })
      expect(cleared.status).toBe(200)
      expect(cleared.body.data.routeName).toBeNull()

      const deactivated = await adminAgent.patch(`/api/v1/transport/drivers/${driver.body.data.id}`).send({ isActive: false })
      expect(deactivated.body.data.isActive).toBe(false)
    })

    it("keeps cross-tenant drivers invisible", async () => {
      const foreignDriver = await prisma.transportDriver.create({
        data: { schoolId: fixtures.otherSchoolId, staffId: staff.active, roleLabel: "Driver" },
      })
      const patch = await adminAgent.patch(`/api/v1/transport/drivers/${foreignDriver.id}`).send({ isActive: false })
      expect(patch.status).toBe(404)
    })
  })

  describe("assignments", () => {
    async function givenAssignedRoute(vehicleCapacity = 40) {
      const vehicle = await givenVehicle({ capacity: vehicleCapacity })
      const route = await givenRoute({ vehicleId: vehicle.id })
      const stop = await givenStop(route.id, "Stop Always")
      return { vehicle, route, stop }
    }

    it("creates an ACTIVE assignment and records an ASSIGN audit", async () => {
      const { route, stop } = await givenAssignedRoute()
      const res = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      expect(res.status).toBe(201)
      const data = res.body.data
      expect(data.studentName).toBe("Amara")
      expect(data.routeName).toBe(route.name)
      expect(data.direction).toBe("TO_SCHOOL")
      expect(data.status).toBe("ACTIVE")
      expect(data.assignedAt).toBeTruthy()

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "ASSIGN", entityType: "TRANSPORT_ASSIGNMENT" },
      })
      expect(audit).not.toBeNull()
      expect(audit!.metadata as Record<string, unknown>).toMatchObject({
        studentId: students.activeA,
        sessionId: sessions.active,
        routeId: route.id,
        replacedAssignmentId: null,
      })
    })

    it("rejects inactive students, closed sessions and routes without an active vehicle", async () => {
      const { route, stop } = await givenAssignedRoute()

      const inactiveStudent = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.inactive, routeId: route.id, stopId: stop.id }),
      )
      expect(inactiveStudent.status).toBe(400)
      expect(inactiveStudent.body.error.message).toContain("not active")

      const closed = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ academicSessionId: sessions.closed, routeId: route.id, stopId: stop.id }),
      )
      expect(closed.status).toBe(400)
      expect(closed.body.error.message).toContain("closed session")

      const noVehicle = await givenRoute()
      const noVehicleStop = await givenStop(noVehicle.id, "No Veh")
      const routeWithoutVehicle = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: noVehicle.id, stopId: noVehicleStop.id }),
      )
      expect(routeWithoutVehicle.status).toBe(400)
      expect(routeWithoutVehicle.body.error.message).toContain("active vehicle")
    })

    it("rejects a stop that belongs to a different route", async () => {
      const { route } = await givenAssignedRoute()
      const other = await givenRoute()
      const otherStop = await givenStop(other.id, "Other Stop")
      const res = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: otherStop.id }),
      )
      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain("not found on this route")
    })

    it("rejects an identical active assignment for the same student/session/direction", async () => {
      const { route, stop } = await givenAssignedRoute()
      await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      const duplicate = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      expect(duplicate.status).toBe(400)
      expect(duplicate.body.error.message).toContain("already assigned")
    })

    it("enforces the per-trip capacity ceiling", async () => {
      const { route, stop } = await givenAssignedRoute(1)
      const first = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeA, routeId: route.id, stopId: stop.id }),
      )
      expect(first.status).toBe(201)

      const second = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeB, routeId: route.id, stopId: stop.id }),
      )
      expect(second.status).toBe(400)
      expect(second.body.error.message).toContain("full capacity")
    })

    it("accounts BOTH as one seat per trip so opposite directions can share a single-seat run", async () => {
      const { route, stop } = await givenAssignedRoute(1)
      const morning = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeA, routeId: route.id, stopId: stop.id, direction: "TO_SCHOOL" }),
      )
      expect(morning.status).toBe(201)

      const afternoon = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeB, routeId: route.id, stopId: stop.id, direction: "FROM_SCHOOL" }),
      )
      expect(afternoon.status).toBe(201)

      const both = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeC, routeId: route.id, stopId: stop.id, direction: "BOTH" }),
      )
      expect(both.status).toBe(400)
      expect(both.body.error.message).toContain("full capacity")
    })

    it("changes an assignment by replacing the prior active row", async () => {
      const a = await givenAssignedRoute()
      const b = await givenAssignedRoute()
      const first = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: a.route.id, stopId: a.stop.id }),
      )
      const firstId = first.body.data.id

      const second = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: b.route.id, stopId: b.stop.id }),
      )
      expect(second.status).toBe(201)
      expect(second.body.data.routeName).toBe(b.route.name)

      const prior = await prisma.transportAssignment.findUnique({ where: { id: firstId } })
      expect(prior!.status).toBe("INACTIVE")
      expect(prior!.deactivatedAt).not.toBeNull()

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "ASSIGN", entityType: "TRANSPORT_ASSIGNMENT", entityId: second.body.data.id },
      })
      expect((audit!.metadata as Record<string, unknown>).replacedAssignmentId).toBe(firstId)
    })

    it("changes a stop within the same route as a replacement, not a duplicate", async () => {
      const { route, stop } = await givenAssignedRoute()
      const stopTwo = await givenStop(route.id, "Stop Two")
      const first = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      const second = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stopTwo.id }),
      )
      expect(second.status).toBe(201)
      expect(second.body.data.stopName).toBe("Stop Two")
      expect((await prisma.transportAssignment.findUnique({ where: { id: first.body.data.id } }))!.status).toBe("INACTIVE")
    })

    it("deactivates, reactivates and blocks reactivation on a closed session", async () => {
      const { route, stop } = await givenAssignedRoute()
      const created = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      const assignmentId = created.body.data.id

      const deactivated = await adminAgent.patch(`/api/v1/transport/assignments/${assignmentId}`).send({ status: "INACTIVE" })
      expect(deactivated.status).toBe(200)
      expect(deactivated.body.data.status).toBe("INACTIVE")
      expect(deactivated.body.data.deactivatedAt).toBeTruthy()

      const reactivated = await adminAgent.patch(`/api/v1/transport/assignments/${assignmentId}`).send({ status: "ACTIVE" })
      expect(reactivated.status).toBe(200)
      expect(reactivated.body.data.status).toBe("ACTIVE")
      expect(reactivated.body.data.deactivatedAt).toBeNull()

      await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      const closedNow = await adminAgent.patch(`/api/v1/transport/assignments/${assignmentId}`).send({ status: "INACTIVE" })
      await prisma.academicSession.update({ where: { id: sessions.active }, data: { status: "CLOSED" } })
      const reactivateClosed = await adminAgent.patch(`/api/v1/transport/assignments/${assignmentId}`).send({ status: "ACTIVE" })
      expect(reactivateClosed.status).toBe(400)
      expect(reactivateClosed.body.error.message).toContain("closed session")
      await prisma.academicSession.update({ where: { id: sessions.active }, data: { status: "ACTIVE" } })
      expect(closedNow.status).toBe(200)
    })

    it("blocks reactivating when another active assignment exists for the same triple", async () => {
      const { route, stop } = await givenAssignedRoute()
      const first = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      const firstId = first.body.data.id
      await adminAgent.patch(`/api/v1/transport/assignments/${firstId}`).send({ status: "INACTIVE" })

      const replacement = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      expect(replacement.status).toBe(201)

      const reactivate = await adminAgent.patch(`/api/v1/transport/assignments/${firstId}`).send({ status: "ACTIVE" })
      expect(reactivate.status).toBe(400)
      expect(reactivate.body.error.message).toContain("already has an active")
    })

    it("updates notes and rejects no-op patches", async () => {
      const { route, stop } = await givenAssignedRoute()
      const created = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ routeId: route.id, stopId: stop.id }),
      )
      const id = created.body.data.id

      const notes = await adminAgent.patch(`/api/v1/transport/assignments/${id}`).send({ notes: "pick up at 6am" })
      expect(notes.status).toBe(200)
      expect(notes.body.data.notes).toBe("pick up at 6am")

      const audit = await prisma.auditLog.findFirst({
        where: { schoolId: fixtures.schoolId, action: "UPDATE", entityType: "TRANSPORT_ASSIGNMENT", entityId: id },
      })
      expect(audit).not.toBeNull()

      const noop = await adminAgent.patch(`/api/v1/transport/assignments/${id}`).send({ status: "ACTIVE" })
      expect(noop.status).toBe(400)
      expect(noop.body.error.message).toContain("No changes")
    })

    it("serves assignment context with sessions, routes (and stops) and students", async () => {
      const { route, stop } = await givenAssignedRoute()
      const res = await adminAgent.get("/api/v1/transport/assignments/context")
      expect(res.status).toBe(200)
      const context = res.body.data
      expect(context.sessions.map((s: { id: string }) => s.id)).toContain(sessions.active)
      expect(context.sessions.map((s: { id: string }) => s.id)).toContain(sessions.upcoming)
      expect(context.sessions.map((s: { id: string }) => s.id)).not.toContain(sessions.closed)

      const targetRoute = context.routes.find((r: { id: string }) => r.id === route.id)
      expect(targetRoute).toBeTruthy()
      expect(targetRoute.capacity).toBe(40)
      expect(targetRoute.stops.map((s: { name: string }) => s.name)).toContain(stop.name)

      const bySearch = await adminAgent.get("/api/v1/transport/assignments/context?studentSearch=Binta")
      expect(bySearch.body.data.students).toHaveLength(1)
      expect(bySearch.body.data.students[0].name).toBe("Binta")
      expect(context.students.map((s: { admissionNumber: string }) => s.admissionNumber)).not.toContain("TRP-ADM-0004")
    })

    it("lists, searches and filters assignments", async () => {
      const a = await givenAssignedRoute()
      const b = await givenAssignedRoute()
      await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeA, routeId: a.route.id, stopId: a.stop.id }),
      )
      await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: students.activeB, routeId: b.route.id, stopId: b.stop.id }),
      )

      const all = await adminAgent.get("/api/v1/transport/assignments")
      expect(all.status).toBe(200)
      expect(all.body.data.pagination.total).toBe(2)

      const byStudent = await adminAgent.get(`/api/v1/transport/assignments?studentId=${students.activeA}`)
      expect(byStudent.body.data.pagination.total).toBe(1)
      expect(byStudent.body.data.items[0].studentName).toBe("Amara")

      const bySearch = await adminAgent.get(`/api/v1/transport/assignments?search=${encodeURIComponent(b.route.name)}`)
      expect(bySearch.body.data.pagination.total).toBe(1)

      const foreign = await adminAgent.get(`/api/v1/transport/assignments?routeId=${b.route.id}`)
      expect(foreign.body.data.pagination.total).toBe(1)
    })

    it("keeps cross-tenant assignments invisible and rejects foreign body references", async () => {
      const { route, stop } = await givenAssignedRoute()
      const foreign = await prisma.school.create({ data: { name: "Foreign Assign School" } })
      const foreignStudent = await prisma.student.create({
        data: {
          schoolId: foreign.id,
          admissionNumber: "TRP-FA-0001",
          firstName: "Mira",
          dateOfBirth: new Date("2014-01-01T00:00:00.000Z"),
          gender: "FEMALE",
          status: "ACTIVE",
          admissionDate: new Date("2026-01-01T00:00:00.000Z"),
        },
      })
      const foreignAssignment = await prisma.transportAssignment.create({
        data: {
          schoolId: foreign.id,
          studentId: foreignStudent.id,
          academicSessionId: sessions.active,
          routeId: route.id,
          stopId: stop.id,
          direction: "TO_SCHOOL",
          status: "ACTIVE",
          assignedAt: new Date(),
        },
      })

      const list = await adminAgent.get("/api/v1/transport/assignments")
      expect(list.body.data.items.some((item: { id: string }) => item.id === foreignAssignment.id)).toBe(false)

      const foreignBody = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ studentId: foreignStudent.id, routeId: route.id, stopId: stop.id }),
      )
      expect(foreignBody.status).toBe(400)

      const closedBody = await adminAgent.post("/api/v1/transport/assignments").send(
        assignmentPayload({ academicSessionId: sessions.closed, routeId: route.id, stopId: stop.id }),
      )
      expect(closedBody.status).toBe(400)
    })
  })
})

async function resetAllTables(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TransportAssignment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TransportDriver" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TransportStop" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TransportRoute" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "TransportVehicle" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "AuditLog" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "LibraryLoan" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "LibraryCopy" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "LibraryBook" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Message" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "ConversationParticipant" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Conversation" CASCADE')
  // Fee rows reference enrollments (Restrict FK). Run order must be irrelevant:
  // other suites leave the shared test DB pristine, truncate the fee stack here
  // like every other integration suite so studentEnrollment deletes never trip
  // feeInvoice_enrollmentId_fkey regardless of which suite ran first.
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeReceipt" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeePayment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInstallment" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeInvoice" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeStructureItem" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeStructure" CASCADE')
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "FeeHead" CASCADE')
  await prisma.timetableEntry.deleteMany()
  await prisma.attendanceRecord.deleteMany()
  await prisma.periodSlot.deleteMany()
  await prisma.studentGuardian.deleteMany()
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