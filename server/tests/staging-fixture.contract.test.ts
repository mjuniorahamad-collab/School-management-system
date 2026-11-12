import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (relative: string): string =>
  readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8")

const command = readSource("src/scripts/staging-fixture.ts")
const planner = readSource("src/scripts/staging-fixture-plan.ts")
const source = `${command}\n${planner}`

describe("staging fixture source contract", () => {
  it("uses the shared staging target guard and verifies identity before writes", () => {
    expect(command).toMatch(/parseStagingTargetArgs\(/)
    expect(command).toMatch(/resolveStagingTarget\(/)
    expect(command).toMatch(/current_database\(\)/)
    expect(command).toMatch(/inet_server_port\(\)/)
    expect(command).toContain("new PrismaClient({ datasourceUrl: target.raw })")

    const resolveTarget = command.indexOf("resolveStagingTarget(")
    const setDatabaseUrl = command.indexOf("process.env.DATABASE_URL = target.raw")
    const loadClient = command.indexOf('await import("@prisma/client")')
    const verifyIdentity = command.indexOf("assertTargetIdentity(prisma, target)")
    const apply = command.indexOf("applyMissingRecords(prisma")

    expect(resolveTarget).toBeGreaterThan(-1)
    expect(setDatabaseUrl).toBeGreaterThan(resolveTarget)
    expect(loadClient).toBeGreaterThan(setDatabaseUrl)
    expect(verifyIdentity).toBeGreaterThan(loadClient)
    expect(apply).toBeGreaterThan(verifyIdentity)
  })

  it("performs no destructive or repair writes", () => {
    expect(source).not.toMatch(
      /\.(deleteManyAndReturn|deleteMany|delete|updateMany|update|upsert|truncate|executeRaw|executeRawUnsafe)\s*\(/,
    )
    expect(source).not.toMatch(/cleanup/i)
    expect(source).not.toMatch(/\b(?:role|permission|rolePermission)\.create(?:Many)?\s*\(/)

    const allowedCreates = new Set([
      "school.create",
      "user.create",
      "userRole.create",
      "tenantMembership.create",
      "teacher.create",
    ])
    const createCalls = [
      ...source.matchAll(/\b([A-Za-z]+)\.(create|createMany)\s*\(/g),
    ].map((match) => `${match[1]}.${match[2]}`)
    expect([...new Set(createCalls)].sort()).toEqual([...allowedCreates].sort())
  })

  it("takes fixture passwords only from the dedicated env vars", () => {
    expect(command).toContain("STAGING_FIXTURE_PRINCIPAL_PASSWORD")
    expect(command).toContain("STAGING_FIXTURE_TEACHER_PASSWORD")
    expect(command).toMatch(/hashPassword\(/)
    expect(command).not.toMatch(/password\s*[:=]\s*["'][^"']+["']/i)
  })

  it("never reads an env file of its own", () => {
    expect(source).not.toContain("dotenv")
    expect(source).not.toContain("loadEnvFile")
  })

  it("documents the fixed fixture identities", () => {
    expect(command).toContain("00000000-0000-4000-8000-000000000101")
    expect(command).toContain("00000000-0000-4000-8000-000000000102")
    expect(command).toContain("principal@stg-sms-it.invalid")
    expect(command).toContain("teacher@stg-sms-it.invalid")
  })
})
