import { Prisma } from "@prisma/client"
import { badRequestError, notFoundError } from "../../lib/ApiError.js"
import { getPrisma } from "../../lib/database.js"
import type { AuthUser } from "../../types/auth.js"
import { recordAudit, resolveAuditActor } from "../audit-logs/audit-log.service.js"
import {
  emptyCopyStatusCounts,
  toBookDetail,
  toBookListItem,
  toCopyDetail,
  toLoanListItem,
} from "./library.mapper.js"
import {
  addDays,
  buildLibraryCopyCode,
  canTransitionCopyStatus,
  isCopyAvailableForIssue,
  joinName,
  LOAN_PERIOD_DAYS,
  MAX_ACTIVE_LOANS_PER_BORROWER,
  normalizeBookIsbn,
  parseLocalDate,
  todayLocalDate,
} from "./library.rules.js"
import type {
  CreateBookInput,
  CreateCopyInput,
  IssueLoanInput,
  ListBooksQuery,
  ListBorrowersQuery,
  ListCopiesQuery,
  ListLoansQuery,
  UpdateBookInput,
  UpdateCopyStatusInput,
} from "./library.schema.js"
import type {
  LibraryBookDetail,
  LibraryBookListResult,
  LibraryBorrowerOption,
  LibraryCopyDetail,
  LibraryCopyListResult,
  LibraryCopyStatusCounts,
  LibraryLoanDetail,
  LibraryLoanListResult,
} from "./library.types.js"

type PrismaClient = NonNullable<Awaited<ReturnType<typeof getPrisma>>>

async function requirePrisma(): Promise<PrismaClient> {
  const prisma = await getPrisma()
  if (!prisma) throw new Error("Database is not configured")
  return prisma
}

function toPagination(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) }
}

// ────────────────────────────────────────────────────────────────────────────
// Books
// ────────────────────────────────────────────────────────────────────────────

async function loadCopyCounts(
  prisma: PrismaClient,
  schoolId: string,
  bookIds: string[],
): Promise<Map<string, LibraryCopyStatusCounts>> {
  const counts = new Map<string, LibraryCopyStatusCounts>()
  if (bookIds.length === 0) return counts
  const rows = await prisma.libraryCopy.findMany({
    where: { schoolId, bookId: { in: bookIds } },
    select: { bookId: true, status: true },
  })
  for (const row of rows) {
    const entry = counts.get(row.bookId) ?? emptyCopyStatusCounts()
    entry[row.status] += 1
    counts.set(row.bookId, entry)
  }
  return counts
}

export async function listBooks(
  query: ListBooksQuery,
  schoolId: string,
): Promise<LibraryBookListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.LibraryBookWhereInput = { schoolId }
  if (query.search) {
    where.OR = [
      { title: { contains: query.search, mode: "insensitive" } },
      { author: { contains: query.search, mode: "insensitive" } },
      { isbn: { contains: query.search, mode: "insensitive" } },
    ]
  }
  if (query.category !== undefined) where.category = query.category
  if (query.isActive !== undefined) where.isActive = query.isActive === "true"

  const orderBy: Prisma.LibraryBookOrderByWithRelationInput = {
    [query.sortBy]: query.sortDir,
  }

  const [total, rows] = await prisma.$transaction([
    prisma.libraryBook.count({ where }),
    prisma.libraryBook.findMany({
      where,
      orderBy,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  const counts = await loadCopyCounts(
    prisma,
    schoolId,
    rows.map((row) => row.id),
  )

  return {
    items: rows.map((row) => {
      const perBook = counts.get(row.id) ?? emptyCopyStatusCounts()
      return toBookListItem(row, {
        totalCopies: perBook.AVAILABLE + perBook.ISSUED + perBook.LOST + perBook.MAINTENANCE,
        availableCopies: perBook.AVAILABLE,
      })
    }),
    pagination: toPagination(query.page, query.pageSize, total),
  }
}

export async function getBookById(id: string, schoolId: string): Promise<LibraryBookDetail> {
  const prisma = await requirePrisma()
  const book = await prisma.libraryBook.findFirst({ where: { id, schoolId } })
  if (!book) throw notFoundError("Book not found")

  const counts = await loadCopyCounts(prisma, schoolId, [book.id])
  return toBookDetail(book, counts.get(book.id) ?? emptyCopyStatusCounts())
}

export async function createBook(
  input: CreateBookInput,
  schoolId: string,
  actor: AuthUser,
): Promise<LibraryBookDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.libraryBook.create({
        data: {
          schoolId,
          title: input.title,
          author: input.author,
          isbn: input.isbn !== undefined ? normalizeBookIsbn(input.isbn) : null,
          publisher: input.publisher ?? null,
          edition: input.edition ?? null,
          category: input.category ?? "OTHER",
          language: input.language ?? null,
          description: input.description ?? null,
          coverUrl: input.coverUrl ?? null,
          isActive: input.isActive ?? true,
        },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "LIBRARY_BOOK",
        entityId: row.id,
        summary: `Added book "${row.title}" by ${row.author}`,
      })

      return row
    })
    return getBookById(created.id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A book with this ISBN already exists in this school")
    }
    throw error
  }
}

export async function updateBook(
  id: string,
  input: UpdateBookInput,
  schoolId: string,
  actor: AuthUser,
): Promise<LibraryBookDetail> {
  const prisma = await requirePrisma()
  const existing = await prisma.libraryBook.findFirst({
    where: { id, schoolId },
    select: {
      id: true,
      title: true,
      author: true,
      isbn: true,
      publisher: true,
      edition: true,
      category: true,
      language: true,
      description: true,
      coverUrl: true,
      isActive: true,
    },
  })
  if (!existing) throw notFoundError("Book not found")

  const data: Prisma.LibraryBookUncheckedUpdateInput = {}
  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []

  function setField(
    field: keyof Prisma.LibraryBookUncheckedUpdateInput,
    before: unknown,
    after: unknown,
    normalize?: (value: string) => string,
  ) {
    const resolvedAfter =
      typeof after === "string" && normalize ? normalize(after) : after
    ;(data as Record<string, unknown>)[field] = resolvedAfter
    if (before !== resolvedAfter) {
      diffFields.push({ field, before, after: resolvedAfter })
    }
  }

  if (input.title !== undefined) setField("title", existing.title, input.title)
  if (input.author !== undefined) setField("author", existing.author, input.author)
  if (input.isbn !== undefined) setField("isbn", existing.isbn, input.isbn, normalizeBookIsbn)
  if (input.publisher !== undefined) setField("publisher", existing.publisher, input.publisher ?? null)
  if (input.edition !== undefined) setField("edition", existing.edition, input.edition ?? null)
  if (input.category !== undefined) setField("category", existing.category, input.category)
  if (input.language !== undefined) setField("language", existing.language, input.language ?? null)
  if (input.description !== undefined) setField("description", existing.description, input.description ?? null)
  if (input.coverUrl !== undefined) setField("coverUrl", existing.coverUrl, input.coverUrl ?? null)
  if (input.isActive !== undefined) setField("isActive", existing.isActive, input.isActive)

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.libraryBook.update({
        where: { id },
        data,
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "UPDATE",
        entityType: "LIBRARY_BOOK",
        entityId: id,
        summary: `Updated book "${existing.title}"`,
        diff: diffFields.length > 0 ? { fields: diffFields } : null,
      })

      return row
    })
    return getBookById(id, schoolId)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("A book with this ISBN already exists in this school")
    }
    throw error
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Copies
// ────────────────────────────────────────────────────────────────────────────

export async function listCopies(
  query: ListCopiesQuery,
  schoolId: string,
): Promise<LibraryCopyListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.LibraryCopyWhereInput = { schoolId }
  if (query.bookId !== undefined) {
    const book = await prisma.libraryBook.findFirst({
      where: { id: query.bookId, schoolId },
      select: { id: true },
    })
    if (!book) throw notFoundError("Book not found")
    where.bookId = query.bookId
  }
  if (query.status !== undefined) where.status = query.status
  if (query.search) {
    where.OR = [
      { copyCode: { contains: query.search, mode: "insensitive" } },
      { book: { title: { contains: query.search, mode: "insensitive" } } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.libraryCopy.count({ where }),
    prisma.libraryCopy.findMany({
      where,
      include: { book: { select: { id: true, title: true, author: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
  ])

  return {
    items: rows.map((row) => toCopyDetail(row, row.book)),
    total,
  }
}

export async function createCopy(
  input: CreateCopyInput,
  schoolId: string,
  actor: AuthUser,
): Promise<LibraryCopyDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  try {
    const created = await prisma.$transaction(async (tx) => {
      const book = await tx.libraryBook.findFirst({
        where: { id: input.bookId, schoolId },
        select: { id: true, title: true },
      })
      if (!book) throw notFoundError("Book not found")

      const school = await tx.school.findUnique({
        where: { id: schoolId },
        select: { libraryCopyCounter: true },
      })
      if (!school) throw notFoundError("School not found")

      const copyCode = buildLibraryCopyCode(school.libraryCopyCounter)

      const row = await tx.libraryCopy.create({
        data: { schoolId, bookId: book.id, copyCode },
        include: { book: { select: { id: true, title: true, author: true } } },
      })

      await tx.school.update({
        where: { id: schoolId },
        data: { libraryCopyCounter: { increment: 1 } },
      })

      await recordAudit(tx, {
        schoolId,
        actorId: auditActor.id,
        actorName: auditActor.name,
        actorRole: auditActor.role,
        actorEmail: auditActor.email,
        action: "CREATE",
        entityType: "LIBRARY_COPY",
        entityId: row.id,
        summary: `Added copy ${copyCode} of "${book.title}"`,
      })

      return row
    })
    return toCopyDetail(created, created.book)
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw badRequestError("Copy code conflict — try again")
    }
    throw error
  }
}

export async function updateCopyStatus(
  copyId: string,
  input: UpdateCopyStatusInput,
  schoolId: string,
  actor: AuthUser,
): Promise<LibraryCopyDetail> {
  const prisma = await requirePrisma()
  const copy = await prisma.libraryCopy.findFirst({
    where: { id: copyId, schoolId },
    include: { book: { select: { id: true, title: true, author: true } } },
  })
  if (!copy) throw notFoundError("Copy not found")

  const transition = canTransitionCopyStatus(copy.status, input.status)
  if (!transition.ok) throw badRequestError(transition.reason ?? "Invalid status change")

  const diffFields: { field: string; before?: unknown; after?: unknown }[] = []
  if (copy.status !== input.status) {
    diffFields.push({ field: "status", before: copy.status, after: input.status })
  }
  if (input.note !== undefined && (copy.note ?? null) !== input.note) {
    diffFields.push({ field: "note", before: copy.note ?? null, after: input.note })
  }

  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.libraryCopy.update({
      where: { id: copy.id },
      data: {
        status: input.status,
        note: input.note !== undefined ? input.note : copy.note,
      },
      include: { book: { select: { id: true, title: true, author: true } } },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "STATUS_CHANGE",
      entityType: "LIBRARY_COPY",
      entityId: copy.id,
      summary: `Marked copy ${copy.copyCode} of "${copy.book.title}" ${input.status.toLowerCase()}`,
      diff: diffFields.length > 0 ? { fields: diffFields } : null,
    })

    return row
  })

  return toCopyDetail(updated, updated.book)
}

// ────────────────────────────────────────────────────────────────────────────
// Borrowers (polymorphic search across ACTIVE students/teachers/staff)
// ────────────────────────────────────────────────────────────────────────────

const BORROWER_SEARCH_LIMIT = 25

interface BorrowerRow {
  id: string
  name: string
  code: string | null
}

async function searchStudents(
  prisma: PrismaClient,
  schoolId: string,
  search?: string,
): Promise<BorrowerRow[]> {
  const where: Prisma.StudentWhereInput = { schoolId, status: "ACTIVE" }
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { admissionNumber: { contains: search, mode: "insensitive" } },
    ]
  }
  const rows = await prisma.student.findMany({
    where,
    select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
    take: BORROWER_SEARCH_LIMIT,
  })
  return rows.map((row) => ({
    id: row.id,
    name: joinName(row.firstName, row.middleName, row.lastName),
    code: row.admissionNumber,
  }))
}

async function searchTeachers(
  prisma: PrismaClient,
  schoolId: string,
  search?: string,
): Promise<BorrowerRow[]> {
  const where: Prisma.TeacherWhereInput = { schoolId, status: "ACTIVE" }
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { employeeId: { contains: search, mode: "insensitive" } },
    ]
  }
  const rows = await prisma.teacher.findMany({
    where,
    select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
    take: BORROWER_SEARCH_LIMIT,
  })
  return rows.map((row) => ({
    id: row.id,
    name: joinName(row.firstName, row.middleName, row.lastName),
    code: row.employeeId,
  }))
}

async function searchStaff(
  prisma: PrismaClient,
  schoolId: string,
  search?: string,
): Promise<BorrowerRow[]> {
  const where: Prisma.StaffWhereInput = { schoolId, status: "ACTIVE" }
  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { middleName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { employeeId: { contains: search, mode: "insensitive" } },
    ]
  }
  const rows = await prisma.staff.findMany({
    where,
    select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
    take: BORROWER_SEARCH_LIMIT,
  })
  return rows.map((row) => ({
    id: row.id,
    name: joinName(row.firstName, row.middleName, row.lastName),
    code: row.employeeId,
  }))
}

export async function listBorrowers(
  query: ListBorrowersQuery,
  schoolId: string,
): Promise<LibraryBorrowerOption[]> {
  const prisma = await requirePrisma()

  const sources: Promise<BorrowerRow[]>[] = []
  if (query.type === undefined || query.type === "STUDENT") {
    sources.push(searchStudents(prisma, schoolId, query.search))
  }
  if (query.type === undefined || query.type === "TEACHER") {
    sources.push(searchTeachers(prisma, schoolId, query.search))
  }
  if (query.type === undefined || query.type === "STAFF") {
    sources.push(searchStaff(prisma, schoolId, query.search))
  }

  const settled = await Promise.all(sources)

  const options: LibraryBorrowerOption[] = []
  let sourceIndex = 0
  for (const item of ["STUDENT", "TEACHER", "STAFF"] as const) {
    const enabled = query.type === undefined || query.type === item
    if (!enabled) continue
    for (const row of settled[sourceIndex] ?? []) {
      options.push({ id: row.id, type: item, name: row.name, code: row.code })
    }
    sourceIndex += 1
  }

  return options.sort((a, b) => a.name.localeCompare(b.name)).slice(0, BORROWER_SEARCH_LIMIT)
}

// ────────────────────────────────────────────────────────────────────────────
// Loans (issue / return)
// ────────────────────────────────────────────────────────────────────────────

async function resolveBorrower(
  prisma: PrismaClient,
  type: "STUDENT" | "TEACHER" | "STAFF",
  borrowerId: string,
  schoolId: string,
): Promise<BorrowerRow | null> {
  if (type === "STUDENT") {
    const row = await prisma.student.findFirst({
      where: { id: borrowerId, schoolId, status: "ACTIVE" },
      select: { id: true, firstName: true, middleName: true, lastName: true, admissionNumber: true },
    })
    return row
      ? { id: row.id, name: joinName(row.firstName, row.middleName, row.lastName), code: row.admissionNumber }
      : null
  }
  if (type === "TEACHER") {
    const row = await prisma.teacher.findFirst({
      where: { id: borrowerId, schoolId, status: "ACTIVE" },
      select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
    })
    return row
      ? { id: row.id, name: joinName(row.firstName, row.middleName, row.lastName), code: row.employeeId }
      : null
  }
  const row = await prisma.staff.findFirst({
    where: { id: borrowerId, schoolId, status: "ACTIVE" },
    select: { id: true, firstName: true, middleName: true, lastName: true, employeeId: true },
  })
  return row
    ? { id: row.id, name: joinName(row.firstName, row.middleName, row.lastName), code: row.employeeId }
    : null
}

export async function listLoans(
  query: ListLoansQuery,
  schoolId: string,
): Promise<LibraryLoanListResult> {
  const prisma = await requirePrisma()

  const where: Prisma.LibraryLoanWhereInput = { schoolId }
  if (query.bookId !== undefined) {
    const book = await prisma.libraryBook.findFirst({
      where: { id: query.bookId, schoolId },
      select: { id: true },
    })
    if (!book) throw notFoundError("Book not found")
    where.copy = { bookId: query.bookId }
  }
  if (query.borrowerType !== undefined) where.borrowerType = query.borrowerType
  if (query.borrowerId !== undefined) {
    const borrower = await resolveBorrower(prisma, query.borrowerType ?? "STUDENT", query.borrowerId, schoolId)
    if (borrower) {
      where.borrowerId = query.borrowerId
      if (query.borrowerType !== undefined) where.borrowerType = query.borrowerType
    } else {
      return { items: [], pagination: toPagination(query.page, query.pageSize, 0) }
    }
  }
  if (query.status === "returned") {
    where.returnedAt = { not: null }
  } else if (query.status === "active" || query.status === "overdue") {
    where.returnedAt = null
  }
  if (query.search) {
    where.OR = [
      { borrowerName: { contains: query.search, mode: "insensitive" } },
      { borrowerCode: { contains: query.search, mode: "insensitive" } },
      { copy: { copyCode: { contains: query.search, mode: "insensitive" } } },
      { copy: { book: { title: { contains: query.search, mode: "insensitive" } } } },
    ]
  }

  const [total, rows] = await prisma.$transaction([
    prisma.libraryLoan.count({ where }),
    prisma.libraryLoan.findMany({
      where,
      include: {
        copy: { select: { copyCode: true, book: { select: { id: true, title: true } } } },
        issuedByUser: { select: { name: true } },
        returnedByUser: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ])

  return {
    items: rows.map((row) =>
      toLoanListItem(row, row.copy, {
        issuedByName: row.issuedByUser?.name ?? null,
        returnedByName: row.returnedByUser?.name ?? null,
      }),
    ),
    pagination: toPagination(query.page, query.pageSize, total),
  }
}

export async function issueLoan(
  input: IssueLoanInput,
  schoolId: string,
  actor: AuthUser,
): Promise<LibraryLoanDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const copy = await prisma.libraryCopy.findFirst({
    where: { id: input.copyId, schoolId },
    include: { book: { select: { id: true, title: true } } },
  })
  if (!copy) throw notFoundError("Copy not found")
  if (!isCopyAvailableForIssue(copy.status)) {
    throw badRequestError(`Copy ${copy.copyCode} is not available for issue`)
  }

  const activeLoanOnCopy = await prisma.libraryLoan.count({
    where: { schoolId, copyId: copy.id, returnedAt: null },
  })
  if (activeLoanOnCopy > 0) {
    throw badRequestError(`Copy ${copy.copyCode} already has an active loan`)
  }

  const borrower = await resolveBorrower(prisma, input.borrowerType, input.borrowerId, schoolId)
  if (!borrower) {
    throw badRequestError("Borrower not found or not active in this school")
  }

  const activeLoans = await prisma.libraryLoan.count({
    where: {
      schoolId,
      borrowerType: input.borrowerType,
      borrowerId: input.borrowerId,
      returnedAt: null,
    },
  })
  if (activeLoans >= MAX_ACTIVE_LOANS_PER_BORROWER) {
    throw badRequestError(
      `Borrower already has the maximum of ${MAX_ACTIVE_LOANS_PER_BORROWER} active loans`,
    )
  }

  const issueDateString = input.issueDate ?? todayLocalDate()
  const dueDateString = input.dueDate ?? addDays(issueDateString, LOAN_PERIOD_DAYS)

  const loan = await prisma.$transaction(async (tx) => {
    const row = await tx.libraryLoan.create({
      data: {
        schoolId,
        copyId: copy.id,
        borrowerType: input.borrowerType,
        borrowerId: borrower.id,
        borrowerName: borrower.name,
        borrowerCode: borrower.code,
        issuedAt: parseLocalDate(issueDateString),
        dueAt: parseLocalDate(dueDateString),
        issuedBy: actor.id,
        notes: input.notes ?? null,
      },
    })

    await tx.libraryCopy.update({
      where: { id: copy.id },
      data: { status: "ISSUED" },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "ISSUE",
      entityType: "LIBRARY_LOAN",
      entityId: row.id,
      summary: `Issued "${copy.book.title}" (${copy.copyCode}) to ${borrower.name}`,
      metadata: {
        bookTitle: copy.book.title,
        copyCode: copy.copyCode,
        borrowerType: input.borrowerType,
        borrowerId: borrower.id,
        dueAt: dueDateString,
      },
    })

    return row
  })

  return toLoanListItem(loan, copy, {
    issuedByName: auditActor.name,
    returnedByName: null,
  })
}

export async function returnLoan(
  loanId: string,
  schoolId: string,
  actor: AuthUser,
): Promise<LibraryLoanDetail> {
  const prisma = await requirePrisma()
  const auditActor = await resolveAuditActor(prisma, schoolId, actor)

  const loan = await prisma.libraryLoan.findFirst({
    where: { id: loanId, schoolId },
    include: { copy: { select: { copyCode: true, book: { select: { id: true, title: true } } } } },
  })
  if (!loan) throw notFoundError("Loan not found")
  if (loan.returnedAt) throw badRequestError("This loan has already been returned")

  const returnedDateString = todayLocalDate()
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.libraryLoan.update({
      where: { id: loan.id },
      data: { returnedAt: parseLocalDate(returnedDateString), returnedBy: actor.id },
    })

    await tx.libraryCopy.update({
      where: { id: loan.copyId },
      data: { status: "AVAILABLE" },
    })

    await recordAudit(tx, {
      schoolId,
      actorId: auditActor.id,
      actorName: auditActor.name,
      actorRole: auditActor.role,
      actorEmail: auditActor.email,
      action: "RETURN",
      entityType: "LIBRARY_LOAN",
      entityId: loan.id,
      summary: `Returned "${loan.copy.book.title}" (${loan.copy.copyCode}) from ${loan.borrowerName}`,
      metadata: { bookTitle: loan.copy.book.title, copyCode: loan.copy.copyCode },
    })

    return row
  })

  return toLoanListItem(updated, loan.copy, {
    issuedByName: null,
    returnedByName: auditActor.name,
  })
}