const PREFIX = "[api]"

export function logRequest(method: string, url: string, statusCode: number, durationMs: number): void {
  console.log(`${PREFIX} ${method} ${url} ${statusCode} ${durationMs.toFixed(1)}ms`)
}

export function logInfo(message: string): void {
  console.log(`${PREFIX} ${message}`)
}

export function logWarn(message: string): void {
  console.warn(`${PREFIX} ${message}`)
}

export function logError(error: unknown): void {
  console.error(`${PREFIX}`, error)
}