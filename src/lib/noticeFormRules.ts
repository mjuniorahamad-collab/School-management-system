import type { NoticeAudience, NoticeFormPayload } from "@/types/communication"

export interface NoticeFormValue {
  title: string
  body: string
  audience: NoticeAudience
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  priority: "HIGH" | "MEDIUM" | "LOW"
}

export interface NoticeFormError {
  field: keyof NoticeFormValue
  message: string
}

const AUDIENCES: NoticeAudience[] = ["EVERYONE", "STUDENTS", "PARENTS", "TEACHERS", "STAFF"]

export function validateNoticeForm(value: NoticeFormValue): NoticeFormError[] {
  const errors: NoticeFormError[] = []
  if (!value.title.trim()) errors.push({ field: "title", message: "Notice title is required" })
  if (!value.body.trim()) errors.push({ field: "body", message: "Notice body is required" })
  if (!AUDIENCES.includes(value.audience)) {
    errors.push({ field: "audience", message: "Invalid audience" })
  }
  return errors
}

export function noticeFormToPayload(value: NoticeFormValue): NoticeFormPayload {
  return {
    title: value.title.trim(),
    body: value.body.trim(),
    audience: value.audience,
    status: value.status,
    priority: value.priority,
  }
}

export function defaultNoticeForm(): NoticeFormValue {
  return {
    title: "",
    body: "",
    audience: "EVERYONE",
    status: "DRAFT",
    priority: "MEDIUM",
  }
}
