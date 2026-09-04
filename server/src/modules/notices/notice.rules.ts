import type { Prisma, Notice } from "@prisma/client"
import { getPrisma } from "../../lib/database.js"

/**
 * Computes the notice rows' update, applying the publish lifecycle:
 * transitioning to PUBLISHED stamps `publishedAt` (server-side, once).
 * Visibility is always filtered by `schoolId` so one tenant can never read or
 * modify another tenant's notices.
 */
export function noticeUpdateData(current: Notice, input: {
  title?: string
  body?: string
  audience?: string
  status?: string
  priority?: string
}): Prisma.NoticeUncheckedUpdateInput {
  const data: Prisma.NoticeUncheckedUpdateInput = {}
  if (input.title !== undefined) data.title = input.title
  if (input.body !== undefined) data.body = input.body
  if (input.audience !== undefined) data.audience = input.audience as Notice["audience"]
  if (input.priority !== undefined) data.priority = input.priority as Notice["priority"]
  if (input.status !== undefined) {
    data.status = input.status as Notice["status"]
    if (input.status === "PUBLISHED" && current.status !== "PUBLISHED") {
      data.publishedAt = new Date()
    }
  }
  return data
}

export async function findNoticeInSchool(
  schoolId: string,
  id: string,
): Promise<Notice | null> {
  const prisma = await getPrisma()
  if (!prisma) return null
  return prisma.notice.findFirst({ where: { id, schoolId } })
}
