import type { AuditAction, AuditEntityType } from "@prisma/client"

export interface AuditRecordInput {
  schoolId?: string | null
  actorId: string
  actorName: string
  actorRole: string
  actorEmail?: string | null
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string | null
  summary: string
  metadata?: Record<string, unknown> | null
  diff?: { fields: { field: string; before?: unknown; after?: unknown }[] } | null
}

/**
 * Actor snapshot resolved at mutation time for audit attribution. Records the
 * tenant role the actor holds (or SUPER_ADMIN for platform-wide actions).
 */
export interface AuditActor {
  id: string
  name: string
  email: string
  role: string
}

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

export interface AuditLogDetail extends AuditLogListItem {
  actorId: string
  actorEmail: string | null
  schoolId: string | null
  metadata: Record<string, unknown> | null
  diff: { fields: { field: string; before?: unknown; after?: unknown }[] } | null
}

export interface AuditLogListResult {
  items: AuditLogListItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type AuditActionCode = AuditAction
export type AuditEntityCode = AuditEntityType