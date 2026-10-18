// Worker-level guard: ensure the `DATABASE_URL` Vitest injects into a worker
// matches `TEST_DATABASE_URL`.
//
// IMPORTANT: Vitest `setupFiles` imports this module but ignores its exports
// ("Vitest will ignore any exports from these files"), so the assertion must run
// as a module-level side effect. Do NOT move it into a default-exported function
// — that silently disables the check. This runs before any test file is imported
// and makes no database connection.
import { assertWorkerDatabaseUrl } from "./verify-worker-db-url.js"

assertWorkerDatabaseUrl(process.env)
