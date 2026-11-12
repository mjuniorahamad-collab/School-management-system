import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const readSource = (relative: string): string =>
  readFileSync(path.resolve(import.meta.dirname, "..", relative), "utf8")

const command = readSource("prisma/roles-staging.ts")

describe("staging role creation source contract", () => {
  it("uses the staging target guard and verifies identity before writing", () => {
    expect(command).toMatch(/parseStagingTargetArgs\(/)
    expect(command).toMatch(/resolveStagingTarget\(/)
    expect(command).toMatch(/current_database\(\)/)
    expect(command).toMatch(/inet_server_port\(\)/)
    expect(command).toContain("new PrismaClient({ datasourceUrl: target.raw })")
  })

  it("creates roles and performs no other writes", () => {
    expect(command).not.toMatch(
      /\.(deleteManyAndReturn|deleteMany|delete|updateMany|update|upsert|executeRaw)\s*\(/,
    )
    expect(command).not.toMatch(
      /\b(?:permission|rolePermission|userRole|tenantMembership|membershipPermission)\.(?:create|createMany|createManyAndReturn|update|updateMany|delete|deleteMany|upsert)\s*\(/,
    )

    const createCalls = [
      ...command.matchAll(/\b([A-Za-z]+)\.(create|createMany|createManyAndReturn)\s*\(/g),
    ].map((match) => `${match[1]}.${match[2]}`)
    expect(createCalls).toEqual(["role.create"])
  })

  it("never loads an env file", () => {
    expect(command).not.toContain("dotenv")
    expect(command).not.toContain("loadEnvFile")
  })
})
