const PREFIX = "[api]"

export interface RequestLogFields {
  method: string
  url: string
  statusCode: number
  durationMs: number
  requestId: string
  userId?: string
}

export function logRequest(fields: RequestLogFields): void {
  console.info(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      component: "api",
      method: fields.method,
      url: fields.url,
      status: fields.statusCode,
      durationMs: Number(fields.durationMs.toFixed(1)),
      requestId: fields.requestId,
      userId: fields.userId,
    }),
  )
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