import express from "express"
import type { Express, Request, Response } from "express"
import request from "supertest"
import { afterEach, describe, expect, it, vi } from "vitest"
import { requestLogger } from "../src/middleware/requestLogger.js"

const MESSAGE_ARGS_INDEX = 0

function buildApp(onRequest: (req: Request, res: Response) => void): Express {
  const app = express()
  app.use(requestLogger)
  app.get("/probe", (req, res) => onRequest(req, res))
  return app
}

function lastLogLine(): Record<string, unknown> {
  const line = vi.mocked(console.info).mock.calls.at(-1)?.[MESSAGE_ARGS_INDEX] ?? ""
  return JSON.parse(String(line)) as Record<string, unknown>
}

describe("request logger", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("emits an X-Request-Id response header and a structured log line", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const app = buildApp((_req, res) => res.json({ ok: true }))

    const res = await request(app).get("/probe").query({ hello: "world" })
    expect(res.status).toBe(200)
    const requestId = res.headers["x-request-id"] as string
    expect(requestId).toMatch(/^[0-9a-f]{16}$/)

    const line = lastLogLine()
    expect(line.method).toBe("GET")
    expect(line.url).toBe("/probe?hello=world")
    expect(line.status).toBe(200)
    expect(line.component).toBe("api")
    expect(line.requestId).toBe(requestId)
    expect(typeof line.durationMs).toBe("number")
    expect(line.userId).toBeUndefined()
    expect(infoSpy).toHaveBeenCalledTimes(1)
  })

  it("forwards a well-formed client-supplied request id", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const app = buildApp((_req, res) => res.json({ ok: true }))

    const res = await request(app).get("/probe").set("X-Request-Id", "edge-prod-123_abc")
    expect(res.headers["x-request-id"]).toBe("edge-prod-123_abc")
    expect(lastLogLine().requestId).toBe("edge-prod-123_abc")
  })

  it("rejects malformed client-supplied request ids", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const app = buildApp((_req, res) => res.json({ ok: true }))

    const res = await request(app).get("/probe").set("X-Request-Id", "not safe!!   ")
    const requestId = res.headers["x-request-id"] as string
    expect(requestId).toMatch(/^[0-9a-f]{16}$/)
    expect(requestId).not.toBe("not safe!!   ")
    expect(lastLogLine().requestId).toBe(requestId)
  })

  it("attaches the authenticated user id to the log line", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {})
    const app = buildApp((req, res) => {
      req.auth = { id: "user-abc-123" } as never
      res.json({ ok: true })
    })

    await request(app).get("/probe")
    expect(lastLogLine().userId).toBe("user-abc-123")
  })
})