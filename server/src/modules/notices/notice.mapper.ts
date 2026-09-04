import type { Notice } from "@prisma/client"
import type { NoticeDetail, NoticeListItem } from "./notice.types.js"

export function toNoticeListItem(notice: Notice): NoticeListItem {
  return {
    id: notice.id,
    title: notice.title,
    audience: notice.audience,
    status: notice.status,
    priority: notice.priority,
    publishedAt: notice.publishedAt?.toISOString() ?? null,
    createdAt: notice.createdAt.toISOString(),
    updatedAt: notice.updatedAt.toISOString(),
  }
}

export function toNoticeDetail(notice: Notice): NoticeDetail {
  return { ...toNoticeListItem(notice), body: notice.body }
}
