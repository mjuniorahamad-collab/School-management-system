import { Prisma } from "@prisma/client"
import { notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
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
  actorId: string,
): Promise<NoticeDetail> {
  const prisma = await requirePrisma()
  const status = input.status ?? "DRAFT"
  const created = await prisma.notice.create({
    data: {
      schoolId,
      title: input.title,
      body: input.body,
      audience: input.audience ?? "EVERYONE",
      priority: input.priority ?? "MEDIUM",
      status,
      publishedAt: status === "PUBLISHED" ? new Date() : null,
      createdBy: actorId,
    },
  })
  return toNoticeDetail(created)
}

export async function updateNotice(
  id: string,
  input: UpdateNoticeInput,
  schoolId: string,
  actorId: string,
): Promise<NoticeDetail> {
  const prisma = await requirePrisma()
  const current = await findNoticeInSchool(schoolId, id)
  if (!current) throw notFoundError("Notice not found")

  const data = noticeUpdateData(current, input)
  data.updatedBy = actorId

  const updated = await prisma.notice.update({ where: { id }, data })
  return toNoticeDetail(updated)
}

export async function deleteNotice(id: string, schoolId: string): Promise<void> {
  const prisma = await requirePrisma()
  const notice = await findNoticeInSchool(schoolId, id)
  if (!notice) throw notFoundError("Notice not found")
  await prisma.notice.delete({ where: { id } })
}
