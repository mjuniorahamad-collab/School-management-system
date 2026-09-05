// Types mirroring the backend audit-logs module contract
// (server/src/modules/audit-logs/audit-log.types.ts + schema).

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE"
  | "PUBLISH"
  | "ARCHIVE"
  | "REVIEW"
  | "CONVERT"
  | "GENERATE"
  | "RECORD_PAYMENT"
  | "ISSUE_RECEIPT"
  | "LOGIN"
  | "FAILED_LOGIN"
  | "LOGOUT"
  | "PERMISSION_CHANGE"
  | "MEMBER_ROLE_CHANGE"
  | "MEMBER_STATUS_CHANGE"
  | "MEMBER_REMOVED"
  | "SETTING_CHANGE"
  | "EXPORT"
  | "CORRECT"

export type AuditEntityType =
  | "STUDENT"
  | "TEACHER"
  | "STAFF"
  | "ADMISSION"
  | "USER"
  | "ROLE"
  | "TENANT_MEMBERSHIP"
  | "ACADEMIC_SESSION"
  | "CLASS"
  | "SECTION"
  | "SUBJECT"
  | "FEE_HEAD"
  | "FEE_STRUCTURE"
  | "FEE_INVOICE"
  | "FEE_INSTALLMENT"
  | "FEE_PAYMENT"
  | "FEE_RECEIPT"
  | "PERIOD_SLOT"
  | "TIMETABLE_ENTRY"
  | "ATTENDANCE_RECORD"
  | "HOMEWORK"
  | "ASSIGNMENT"
  | "EXAM"
  | "EXAM_RESULT"
  | "EXAM_MARK"
  | "EXAM_TYPE"
  | "GRADING_BAND"
  | "NOTICE"
  | "EVENT"
  | "SCHOOL_SETTING"
  | "AUTH"

export interface AuditLogListItem {
  id: string
  actorName: string
  actorRole: string
  action: AuditAction
  entityType: AuditEntityType
  entityId: string | null
  summary: string
  createdAt: string
}

export interface AuditLogPagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface AuditLogListResult {
  items: AuditLogListItem[]
  pagination: AuditLogPagination
}

export interface AuditLogDiffField {
  field: string
  before?: unknown
  after?: unknown
}

export interface AuditLogDetail extends AuditLogListItem {
  actorId: string
  actorEmail: string | null
  schoolId: string | null
  metadata: Record<string, unknown> | null
  diff: { fields: AuditLogDiffField[] } | null
}

export interface ListAuditLogsQuery {
  page: number
  pageSize: number
  search?: string
  entityType?: AuditEntityType
  action?: AuditAction
  actorId?: string
  entityId?: string
  from?: string
  to?: string
}

export const AUDIT_ACTION_OPTIONS: AuditAction[] = [
  "CREATE",
  "UPDATE",
  "DELETE",
  "STATUS_CHANGE",
  "PUBLISH",
  "ARCHIVE",
  "REVIEW",
  "CONVERT",
  "GENERATE",
  "RECORD_PAYMENT",
  "ISSUE_RECEIPT",
  "LOGIN",
  "FAILED_LOGIN",
  "LOGOUT",
  "PERMISSION_CHANGE",
  "MEMBER_ROLE_CHANGE",
  "MEMBER_STATUS_CHANGE",
  "MEMBER_REMOVED",
  "SETTING_CHANGE",
  "EXPORT",
  "CORRECT",
]

export const AUDIT_ENTITY_OPTIONS: AuditEntityType[] = [
  "STUDENT",
  "TEACHER",
  "STAFF",
  "ADMISSION",
  "USER",
  "ROLE",
  "TENANT_MEMBERSHIP",
  "ACADEMIC_SESSION",
  "CLASS",
  "SECTION",
  "SUBJECT",
  "FEE_HEAD",
  "FEE_STRUCTURE",
  "FEE_INVOICE",
  "FEE_INSTALLMENT",
  "FEE_PAYMENT",
  "FEE_RECEIPT",
  "PERIOD_SLOT",
  "TIMETABLE_ENTRY",
  "ATTENDANCE_RECORD",
  "HOMEWORK",
  "ASSIGNMENT",
  "EXAM",
  "EXAM_RESULT",
  "EXAM_MARK",
  "EXAM_TYPE",
  "GRADING_BAND",
  "NOTICE",
  "EVENT",
  "SCHOOL_SETTING",
  "AUTH",
]

const ACTION_LABELS: Partial<Record<AuditAction, string>> = {
  STATUS_CHANGE: "Status change",
  PUBLISH: "Publish",
  ARCHIVE: "Archive",
  REVIEW: "Review",
  CONVERT: "Convert",
  GENERATE: "Generate",
  RECORD_PAYMENT: "Record payment",
  ISSUE_RECEIPT: "Issue receipt",
  FAILED_LOGIN: "Failed sign-in",
  LOGOUT: "Sign-out",
  PERMISSION_CHANGE: "Permission change",
  MEMBER_ROLE_CHANGE: "Role change",
  MEMBER_STATUS_CHANGE: "Membership status change",
  MEMBER_REMOVED: "Member removed",
  SETTING_CHANGE: "Setting change",
  CORRECT: "Correction",
}

const ENTITY_LABELS: Partial<Record<AuditEntityType, string>> = {
  TENANT_MEMBERSHIP: "Membership",
  ACADEMIC_SESSION: "Academic session",
  SECTION: "Section",
  SUBJECT: "Subject",
  FEE_HEAD: "Fee head",
  FEE_STRUCTURE: "Fee structure",
  FEE_INVOICE: "Fee invoice",
  FEE_INSTALLMENT: "Fee installment",
  FEE_PAYMENT: "Fee payment",
  FEE_RECEIPT: "Receipt",
  PERIOD_SLOT: "Period slot",
  TIMETABLE_ENTRY: "Timetable entry",
  ATTENDANCE_RECORD: "Attendance",
  EXAM_RESULT: "Exam result",
  EXAM_MARK: "Exam mark",
  EXAM_TYPE: "Exam type",
  GRADING_BAND: "Grading band",
  SCHOOL_SETTING: "Setting",
}

export function formatAuditAction(action: AuditAction): string {
  return ACTION_LABELS[action] ?? action.charAt(0) + action.slice(1).toLowerCase()
}

export function formatAuditEntity(entityType: AuditEntityType): string {
  return ENTITY_LABELS[entityType] ?? entityType.charAt(0) + entityType.slice(1).toLowerCase()
}