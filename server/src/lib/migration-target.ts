import {
  assertDirectDatabaseUrl,
  canonicalizeHost,
  databaseTargetsEquivalent,
  isProductionEquivalent,
  parseDatabaseTarget,
  readProductionIdentity,
  type DatabaseTarget,
} from "./database-target.js"

export interface DeploymentApproval {
  allowProduction: boolean
  confirmHost: string | null
  confirmPort: string | null
  confirmDatabase: string | null
}

export function parseDeploymentArgs(args: string[]): DeploymentApproval {
  const approval: DeploymentApproval = {
    allowProduction: false,
    confirmHost: null,
    confirmPort: null,
    confirmDatabase: null,
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--allow-production") {
      approval.allowProduction = true
      continue
    }
    if (arg === "--confirm-host" || arg === "--confirm-port" || arg === "--confirm-database") {
      const value = args[index + 1]
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`Refusing to migrate: ${arg} requires a value.`)
      }
      index += 1
      if (arg === "--confirm-host") approval.confirmHost = value
      if (arg === "--confirm-port") approval.confirmPort = value
      if (arg === "--confirm-database") approval.confirmDatabase = value
      continue
    }
    throw new Error(`Refusing to migrate: unsupported migration argument "${arg}".`)
  }
  return approval
}

export function resolveMigrationExecutionTarget(
  appUrl: string,
  env: NodeJS.ProcessEnv,
): DatabaseTarget {
  const app = parseDatabaseTarget(appUrl)
  if (app === null) {
    throw new Error("Refusing to migrate: DATABASE_URL is not a parseable PostgreSQL connection string.")
  }

  if (!app.pooled) {
    return assertDirectDatabaseUrl(appUrl, "migrating the database")
  }

  const migrationUrl = env.MIGRATION_DATABASE_URL
  if (migrationUrl === undefined || migrationUrl.trim() === "") {
    throw new Error(
      "Refusing to migrate: DATABASE_URL uses a pooled endpoint. Set MIGRATION_DATABASE_URL to the " +
        "direct, unpooled URL for the same database (environment/secret injection only).",
    )
  }

  const direct = assertDirectDatabaseUrl(migrationUrl, "migrating the database")
  if (!databaseTargetsEquivalent(app, direct)) {
    throw new Error(
      "Refusing to migrate: MIGRATION_DATABASE_URL does not name the same database as DATABASE_URL. " +
        "Connection strings are intentionally not printed.",
    )
  }
  return direct
}

export function assertRemoteApprovals(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv,
  approval: DeploymentApproval,
): void {
  const production = readProductionIdentity(env)
  const productionEquivalent = isProductionEquivalent(target, production)
  const host = canonicalizeHost(target.host)
  const confirmationsPresent =
    approval.confirmHost !== null &&
    approval.confirmPort !== null &&
    approval.confirmDatabase !== null

  if (!confirmationsPresent) {
    throw new Error(
      "Refusing to migrate: a remote target requires --confirm-host, --confirm-port and " +
        "--confirm-database with the exact target identity.",
    )
  }
  if (
    approval.confirmHost?.toLowerCase() !== host ||
    approval.confirmPort !== target.port ||
    approval.confirmDatabase?.toLowerCase() !== target.database.toLowerCase()
  ) {
    throw new Error(
      "Refusing to migrate: the confirmation values do not match the target database identity.",
    )
  }

  if (productionEquivalent) {
    if (!approval.allowProduction) {
      throw new Error(
        "Refusing to migrate: the target is production-equivalent. Pass --allow-production and all " +
          "three exact confirmations to proceed.",
      )
    }
    return
  }

  if (approval.allowProduction) {
    throw new Error(
      "Refusing to migrate: --allow-production is only valid for a production-equivalent target.",
    )
  }
}
