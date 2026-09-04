export interface NoticeListItem {
  id: string
  title: string
  audience: string
  status: string
  priority: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type NoticeDetail = NoticeListItem & { body: string }

export interface NoticeListResult {
  items: NoticeListItem[]
  total: number
}
