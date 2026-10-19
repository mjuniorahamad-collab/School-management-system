// Report Card scheme configuration service (docs/report-card.md §2, §4, §5,
// §7; M6a).
//
// A scheme is identified by its natural scope `(schoolId, academicSessionId,
// classId, scopeKey)` — there is no client-supplied id, so configuration is an
// idempotent upsert keyed on scope. `scopeKey` is derived server-side from
// `sectionId` (`__CLASS__` for a whole-class scheme) and is never trusted from
// the request body.
//
// Concurrency: the upsert classifies its audit action (CREATE vs UPDATE) from
// the committed state. Two concurrent first-time upserts for one scope must not
// both record CREATE, and an update must never be recorded as a creation, so the
// transaction takes a scope-keyed advisory lock (`lockReportCardSchemeScope`)
// BEFORE reading the existing row. The first writer creates; the second blocks,
// then re-reads the committed row and correctly classifies UPDATE.

import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError, serviceUnavailableError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import { lockReportCardSchemeScope } from "../../lib/db-locks.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import type { AuditActor } from "../audit-logs/audit-log.types.js"
import {
  REPORT_CARD_SCHEME_INCLUDE,
  toReportCardSchemeDetail,
  type ReportCardSchemeWithExams,
} from "./report-card-scheme.mapper.js"
import { normalizeSchemeInput, type NormalizedScheme } from "./report-card-scheme.rules.js"
import type {
  ListReportCardSchemesQuery,
  UpsertReportCardSchemeInput,
} from "./report-card-scheme.schema.js"
import type {
  ReportCardSchemeDetail,
  ReportCardSchemeListResult,
} from "./report-card-scheme.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw serviceUnavailableError("Database is not configured")
  return prisma
}

/**
 * Verifies every referenced id belongs to the authenticated school. Runs inside
 * the upsert transaction so the tenant scope is authoritative. A section is
 * checked against its class (sections carry no schoolId of their own) and the
 * class itself is already school-scoped, which preserves tenant isolation.
 */
async function assertReferences(
  tx: Prisma.TransactionClient,
  schoolId: string,
  scheme: NormalizedScheme,
): Promise<void> {
  const session = await tx.academicSession.findFirst({
    where: { id: scheme.academicSessionId, schoolId },
    select: { id: true },
  })
  if (!session) throw badRequestError("Academic session not found in this school")

  const targetClass = await tx.class.findFirst({
    where: { id: scheme.classId, schoolId },
    select: { id: true },
  })
  if (!targetClass) throw badRequestError("Class not found in this school")

  if (scheme.sectionId) {
    const section = await tx.section.findFirst({
      where: { id: scheme.sectionId, classId: scheme.classId },
      select: { id: true },
    })
    if (!section) throw badRequestError("Section does not belong to the selected class")
  }

  const examTypeIds = scheme.exams.map((exam) => exam.examTypeId)
  const examTypes = await tx.examType.findMany({
    where: { id: { in: examTypeIds }, schoolId },
    select: { id: true },
  })
  if (examTypes.length !== examTypeIds.length) {
    throw badRequestError("One or more exam types do not belong to this school")
  }

  if (scheme.coreSubjectIds.length > 0) {
    const subjects = await tx.subject.findMany({
      where: { id: { in: scheme.coreSubjectIds }, schoolId },
      select: { id: true },
    })
    if (subjects.length !== scheme.coreSubjectIds.length) {
      throw badRequestError("One or more core subjects do not belong to this school")
    }
  }
}

function decimalEquals(left: string, right: string): boolean {
  return Number(left) === Number(right)
}

function sortedUnique(values: readonly string[]): string[] {
  return [...values].sort()
}

function examSetEquals(
  existing: ReportCardSchemeWithExams["exams"],
  next: NormalizedScheme["exams"],
): boolean {
  if (existing.length !== next.length) return false
  const byType = new Map(existing.map((exam) => [exam.examTypeId, exam]))
  return next.every((exam) => {
    const current = byType.get(exam.examTypeId)
    if (!current) return false
    return decimalEquals(current.weight.toString(), exam.weight) && current.sortOrder === exam.sortOrder
  })
}

function buildUpdateDiff(
  existing: ReportCardSchemeWithExams,
  next: NormalizedScheme,
): { field: string; before?: unknown; after?: unknown }[] {
  const fields: { field: string; before?: unknown; after?: unknown }[] = []

  if (existing.aggregationPolicy !== next.aggregationPolicy) {
    fields.push({ field: "aggregationPolicy", before: existing.aggregationPolicy, after: next.aggregationPolicy })
  }
  if (existing.absencePolicy !== next.absencePolicy) {
    fields.push({ field: "absencePolicy", before: existing.absencePolicy, after: next.absencePolicy })
  }
  if (existing.overallPassMode !== next.overallPassMode) {
    fields.push({ field: "overallPassMode", before: existing.overallPassMode, after: next.overallPassMode })
  }
  const beforePercent = existing.annualSubjectPassPercent.toString()
  if (!decimalEquals(beforePercent, next.annualSubjectPassPercent)) {
    fields.push({ field: "annualSubjectPassPercent", before: beforePercent, after: next.annualSubjectPassPercent })
  }
  const beforeOverall = existing.overallPassPercent?.toString() ?? null
  if (
    (beforeOverall === null) !== (next.overallPassPercent === null) ||
    (beforeOverall !== null &&
      next.overallPassPercent !== null &&
      !decimalEquals(beforeOverall, next.overallPassPercent))
  ) {
    fields.push({ field: "overallPassPercent", before: beforeOverall, after: next.overallPassPercent })
  }
  if (existing.maxFailedSubjects !== next.maxFailedSubjects) {
    fields.push({ field: "maxFailedSubjects", before: existing.maxFailedSubjects, after: next.maxFailedSubjects })
  }
  if (
    JSON.stringify(sortedUnique(existing.coreSubjectIds)) !==
    JSON.stringify(sortedUnique(next.coreSubjectIds))
  ) {
    fields.push({ field: "coreSubjectIds", before: existing.coreSubjectIds, after: next.coreSubjectIds })
  }
  if (existing.publicationMode !== next.publicationMode) {
    fields.push({ field: "publicationMode", before: existing.publicationMode, after: next.publicationMode })
  }
  if (!examSetEquals(existing.exams, next.exams)) {
    fields.push({
      field: "exams",
      before: existing.exams.map((exam) => ({
        examTypeId: exam.examTypeId,
        weight: exam.weight.toString(),
        sortOrder: exam.sortOrder,
      })),
      after: next.exams.map((exam) => ({
        examTypeId: exam.examTypeId,
        weight: exam.weight,
        sortOrder: exam.sortOrder,
      })),
    })
  }

  return fields
}

function referenceWhere(
  schoolId: string,
  query: ListReportCardSchemesQuery,
): Prisma.ReportCardSchemeWhereInput {
  const where: Prisma.ReportCardSchemeWhereInput = { schoolId }
  if (query.academicSessionId) where.academicSessionId = query.academicSessionId
  if (query.classId) where.classId = query.classId
  if (query.sectionId) where.sectionId = query.sectionId
  return where
}

export async function listReportCardSchemes(
  query: ListReportCardSchemesQuery,
  schoolId: string,
): Promise<ReportCardSchemeListResult> {
  const prisma = await requirePrisma()
  const where = referenceWhere(schoolId, query)

  const [total, rows] = await prisma.$transaction([
    prisma.reportCardScheme.count({ where }),
    prisma.reportCardScheme.findMany({
      where,
      include: REPORT_CARD_SCHEME_INCLUDE,
      orderBy: { createdAt: "desc" },
    }),
  ])

  return { items: rows.map(toReportCardSchemeDetail), total }
}

export async function getReportCardSchemeById(
  id: string,
  schoolId: string,
): Promise<ReportCardSchemeDetail> {
  const prisma = await requirePrisma()
  const scheme = await prisma.reportCardScheme.findFirst({
    where: { id, schoolId },
    include: REPORT_CARD_SCHEME_INCLUDE,
  })
  if (!scheme) throw notFoundError("Report card scheme not found")
  return toReportCardSchemeDetail(scheme)
}

export async function upsertReportCardScheme(
  input: UpsertReportCardSchemeInput,
  schoolId: string,
  actor: AuthUser,
): Promise<ReportCardSchemeDetail> {
  const scheme = normalizeSchemeInput(input)
  const prisma = await requirePrisma()
  const auditActor: AuditActor = await resolveAuditActor(prisma, schoolId, actor)

  const examRows = scheme.exams.map((exam) => ({
    examTypeId: exam.examTypeId,
    weight: exam.weight,
    sortOrder: exam.sortOrder,
  }))

  const policyData = {
    aggregationPolicy: scheme.aggregationPolicy,
    absencePolicy: scheme.absencePolicy,
    overallPassMode: scheme.overallPassMode,
    annualSubjectPassPercent: scheme.annualSubjectPassPercent,
    overallPassPercent: scheme.overallPassPercent,
    maxFailedSubjects: scheme.maxFailedSubjects,
    coreSubjectIds: scheme.coreSubjectIds,
    publicationMode: scheme.publicationMode,
  }

  try {
    const row = await prisma.$transaction(async (tx) => {
      // Serialize per scope before reading: classification of CREATE vs UPDATE
      // must come from committed state, and the row may not exist yet.
      await lockReportCardSchemeScope(tx, {
        schoolId,
        academicSessionId: scheme.academicSessionId,
        classId: scheme.classId,
        scopeKey: scheme.scopeKey,
      })

      await assertReferences(tx, schoolId, scheme)

      const existing = await tx.reportCardScheme.findFirst({
        where: {
          schoolId,
          academicSessionId: scheme.academicSessionId,
          classId: scheme.classId,
          scopeKey: scheme.scopeKey,
        },
        include: REPORT_CARD_SCHEME_INCLUDE,
      })

      if (existing) {
        const updated = await tx.reportCardScheme.update({
          where: { id: existing.id },
          data: {
            ...policyData,
            updatedByUserId: actor.id,
            exams: { deleteMany: {}, create: examRows },
          },
          include: REPORT_CARD_SCHEME_INCLUDE,
        })

        const diffFields = buildUpdateDiff(existing, scheme)
        await recordAudit(tx, {
          schoolId,
          actorId: auditActor.id,
          actorName: auditActor.name,
          actorRole: auditActor.role,
          actorEmail: auditActor.email,
          action: "UPDATE",
          entityType: "REPORT_CARD_SCHEME",
          entityId: existing.id,
          summary: "Updated report card scheme",
          diff: diffFields.length > 0 ? { fields: diffFields } : null,
        })

        return updated
      }

      const created = await tx.reportCardScheme.create({
        data: {
          schoolId,
          academicSessionId: scheme.academicSessionId,
          classId: scheme.classId,
          sectionId: scheme.sectionId,
          scopeKey: scheme.scopeKey,
          ...policyData,
          createdByUserId: actor.id,
          updatedByUserId: actor.id,
          exams: { create: examRows },
        },
        include: REPORT_CARD_SCHEME_INCLUDE,
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "REPORT_CARD_SCHEME",
        entityId: created.id,
        summary: "Created report card scheme",
      })

      return created
    })

    return toReportCardSchemeDetail(row)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A report card scheme already exists for this scope")
    }
    throw error
  }
}
