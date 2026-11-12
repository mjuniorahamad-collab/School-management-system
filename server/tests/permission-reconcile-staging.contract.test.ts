import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (relative: string): string =>
  readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8")

const command = readSource("prisma/reconcile-permissions-staging.ts")
const writer = readSource("prisma/permission-reconcile-db.ts")

describe("staging permission reconciliation source contract", () => {
  it("reuses the catalogue planner and the staging target guard", () => {
    expect(command).toMatch(/buildReconcilePlan\(/)
    expect(command).toMatch(/parseStagingTargetArgs\(/)
    expect(command).toMatch(/resolveStagingTarget\(/)
    expect(command).toMatch(/applyAdditiveReconcile\(/)
    expect(command).toMatch(/current_database\(\)/)
    expect(command).toMatch(/inet_server_port\(\)/)
  })

  it("points the client at the resolved target and verifies identity before writing", () => {
    const resolveTarget = command.indexOf("resolveStagingTarget(")
    const setDatabaseUrl = command.indexOf("process.env.DATABASE_URL = target.raw")
    const loadClient = command.indexOf('await import("@prisma/client")')
    const verifyIdentity = command.indexOf("assertTargetIdentity(prisma, target)")
    const apply = command.indexOf("applyAdditiveReconcile(prisma, plan)")

    expect(resolveTarget).toBeGreaterThan(-1)
    expect(setDatabaseUrl).toBeGreaterThan(resolveTarget)
    expect(loadClient).toBeGreaterThan(setDatabaseUrl)
    expect(command).toContain("new PrismaClient({ datasourceUrl: target.raw })")
    expect(verifyIdentity).toBeGreaterThan(loadClient)
    expect(apply).toBeGreaterThan(verifyIdentity)
  })

  it("never reads an env file of its own", () => {
    expect(command).not.toContain("dotenv")
    expect(command).not.toContain("loadEnvFile")
    expect(writer).not.toContain("dotenv")
    expect(writer).not.toContain("loadEnvFile")
  })

  it("keeps the write path additive and limited to permission and grant inserts", () => {
    expect(writer).not.toMatch(
      /\.(deleteMany|deleteManyAndReturn|delete|updateMany|update|upsert|executeRaw)\s*\(/,
    )
    expect(writer).not.toMatch(/\brole\.create(?:Many)?\s*\(/)

    const createCalls = [...writer.matchAll(/\b([A-Za-z]+)\.(create|createMany)\s*\(/g)].map(
      (match) => `${match[1]}.${match[2]}`,
    )
    expect(createCalls).toEqual(["permission.create", "rolePermission.createMany"])

    expect(command).not.toMatch(/permission\.create\(/)
    expect(command).not.toMatch(/rolePermission\.createMany\(/)
  })
})
