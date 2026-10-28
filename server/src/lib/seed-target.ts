import {
  assertDirectDatabaseUrl,
  isLocalDatabaseTarget,
  isProductionEquivalent,
  readProductionIdentity,
} from "./database-target.js"

export function assertSeedTarget(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): void {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed: the development seed never runs with NODE_ENV=production. " +
        "Use the production bootstrap instead.",
    )
  }

  const raw = env.DATABASE_URL
  if (raw === undefined || raw.trim() === "") {
    throw new Error("Refusing to seed: DATABASE_URL is not set.")
  }
  const target = assertDirectDatabaseUrl(raw, "to seed")
  if (isLocalDatabaseTarget(target)) return

  const args = new Set(argv)
  if (!args.has("--allow-non-local")) {
    throw new Error(
      "Refusing to seed: DATABASE_URL points at a remote database. Re-run with --allow-non-local " +
        "only after confirming the target identity. This flag is per-invocation and is never read from the environment.",
    )
  }

  const production = readProductionIdentity(env)
  if (isProductionEquivalent(target, production)) {
    throw new Error("Refusing to seed: the target is the production database.")
  }
}
