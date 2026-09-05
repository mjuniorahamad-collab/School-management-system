import { Prisma } from "@prisma/client"
import type { Notice } from "@prisma/client"
import { notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { CreateNoticeInput, ListNoticesQuery, UpdateNoticeInput } from "./notice.schema.js"
import { toNoticeDetail, toNoticeListItem } from "./notice.mapper.js"
import { findNoticeInSchool, noticeUpdateData } from "./notice.rules.js"
import type { NoticeDetail, NoticeListResult } from "./notice.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

export async function listNotices(
  query: ListNoticesQuery,
  schoolId: string,
): Promise<NoticeListResult> {
  const prisma = await requirePrisma()
  const { page, pageSize } = query

  const where: Prisma.NoticeWhereInput = { schoolId }
  if (query.status) where.status = query.status
  if (query.audience) where.audience = query.audience
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { body: { contains: query.search, mode: "insensitive" } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.notice.count({ where }),
    prisma.notice.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return { items: rows.map(toNoticeListItem), total }
}

export async function getNoticeById(id: string, schoolId: string): Promise<NoticeDetail> {
  const prisma = await requirePrisma()
  const notice = await prisma.notice.findFirst({ where: { id, schoolId } })
  if (!notice) throw notFoundError("Notice not found")
  return toNoticeDetail(notice)
}

export async function createNotice(
  input: CreateNoticeInput,
  schoolId: string,
  actor: AuthUser,
): Promise<NoticeDetail> {
  const prisma = await requirePrisma()
  const status = input.status ?? "DRAFT"
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.notice.create({
      data: {
        schoolId,
        title: input.title,
        body: input.body,
        audience: input.audience ?? "EVERYONE",
        priority: input.priority ?? "MEDIUM",
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
        createdBy: actor.id,
      },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: status === "PUBLISHED" ? "PUBLISH" : "CREATE",
      entityType: "NOTICE",
      entityId: row.id,
      summary: status === "PUBLISHED"
        ? `Published notice "${row.title}"`
        : `Created notice "${row.title}"`,
      metadata: { status, audience: row.audience, priority: row.priority },
    })

    return row
  })
  return toNoticeDetail(created)
}

export async function updateNotice(
  id: string,
  input: UpdateNoticeInput,
  schoolId: string,
  actor: AuthUser,
): Promise<NoticeDetail> {
  const prisma = await requirePrisma()
  const current = await findNoticeInSchool(schoolId, id)
  if (!current) throw notFoundError("Notice not found")

  const data = noticeUpdateData(current, input)
  data.updatedBy = actor.id

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  const nextStatus = (input.status ?? current.status) as Notice["status"]
  const publishedNow = nextStatus === "PUBLISHED" && current.status !== "PUBLISHED"

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.notice.update({ where: { id }, data })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: publishedNow ? "PUBLISH" : input.status !== undefined ? "STATUS_CHANGE" : "UPDATE",
      entityType: "NOTICE",
      entityId: id,
      summary: publishedNow
        ? `Published notice "${current.title}"`
        : input.status !== undefined
          ? `Changed notice status to ${nextStatus}`
          : `Updated notice "${current.title}"`,
      diff: {
        fields: [
          ...(input.status !== undefined && current.status !== nextStatus
            ? [{ field: "status", before: current.status, after: nextStatus }]
            : []),
          ...(input.title !== undefined && current.title !== input.title
            ? [{ field: "title", before: current.title, after: input.title }]
            : []),
        ],
      },
    })

    return row
  })
  return toNoticeDetail(updated)
}

export async function deleteNotice(id: string, schoolId: string, actor: AuthUser): Promise<void> {
  const prisma = await requirePrisma()
  const notice = await findNoticeInSchool(schoolId, id)
  if (!notice) throw notFoundError("Notice not found")
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  await prisma.$transaction(async (tx) => {
    await tx.notice.delete({ where: { id } })
    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "DELETE",
      entityType: "NOTICE",
      entityId: id,
      summary: `Deleted notice "${notice.title}"`,
    })
  })
}
