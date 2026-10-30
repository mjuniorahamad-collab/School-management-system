// Build the environment Vitest injects into test workers.
//
// Workers re-run the database guards, so they need the same remote-target
// identity values the main process validated. Forwarding these non-secret
// values keeps the worker-side reset from silently losing remote support.

const REMOTE_TEST_IDENTITY_KEYS = [
  "ALLOW_REMOTE_TEST_DATABASE",
  "EXPECTED_TEST_DATABASE_HOST",
  "EXPECTED_TEST_DATABASE_NAME",
  "EXPECTED_TEST_DATABASE_USER",
  "PRODUCTION_DATABASE_HOST",
  "PRODUCTION_DATABASE_NAME",
] as const

export function buildIntegrationEnv(
  source: Record<string, string | undefined>,
  extra: Record<string, string> = {},
): Record<string, string> {
  const env: Record<string, string> = { ...extra }
  const testUrl = source.TEST_DATABASE_URL
  if (testUrl === undefined || testUrl.trim() === "") {
    return env
  }

  env.DATABASE_URL = testUrl
  env.TEST_DATABASE_URL = testUrl
  env.NODE_ENV = "test"

  for (const key of REMOTE_TEST_IDENTITY_KEYS) {
    const value = source[key]
    if (value !== undefined && value.trim() !== "") {
      env[key] = value
    }
  }

  return env
}
