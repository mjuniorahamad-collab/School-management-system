import { z } from "zod"
import { LibraryBorrowerType, LibraryCategory, LibraryCopyStatus } from "@prisma/client"

const emptyToUndefined = z.literal("").transform(() => undefined)

function optionalParam<TSchema extends z.ZodType>(schema: TSchema) {
  return z.union([emptyToUndefined, schema]).optional()
}

function optionalText(max: number) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  )
}

const categorySchema = z.nativeEnum(LibraryCategory)
const borrowerTypeSchema = z.nativeEnum(LibraryBorrowerType)
const copyStatusSchema = z.nativeEnum(LibraryCopyStatus)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be formatted as YYYY-MM-DD")

export const createBookSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(300),
    author: z.string().trim().min(1, "Author is required").max(200),
    isbn: optionalText(30),
    publisher: optionalText(200),
    edition: optionalText(100),
    category: categorySchema.optional(),
    language: optionalText(100),
    description: optionalText(2000),
    coverUrl: optionalText(2000),
    isActive: z.boolean().optional(),
  })
  .strict()

export const updateBookSchema = createBookSchema.partial().strict()

export const listBooksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: optionalParam(z.string().trim().min(1).max(100)),
  category: optionalParam(categorySchema),
  isActive: z.enum(["true", "false"]).optional(),
  sortBy: z.enum(["title", "author", "updatedAt"]).optional().default("title"),
  sortDir: z.enum(["asc", "desc"]).optional().default("asc"),
})

export const createCopySchema = z
  .object({
    bookId: z.string().trim().min(1, "Book is required").max(64),
  })
  .strict()

export const updateCopyStatusSchema = z
  .object({
    status: copyStatusSchema,
    note: optionalText(300),
  })
  .strict()

export const listCopiesQuerySchema = z.object({
  bookId: optionalParam(z.string().trim().min(1).max(64)),
  status: optionalParam(copyStatusSchema),
  search: optionalParam(z.string().trim().min(1).max(100)),
})

export const listBorrowersQuerySchema = z.object({
  type: optionalParam(borrowerTypeSchema),
  search: optionalParam(z.string().trim().min(1).max(100)),
})

export const issueLoanSchema = z
  .object({
    copyId: z.string().trim().min(1, "A copy is required").max(64),
    borrowerType: borrowerTypeSchema,
    borrowerId: z.string().trim().min(1, "A borrower is required").max(64),
    issueDate: optionalParam(dateSchema),
    dueDate: optionalParam(dateSchema),
    notes: optionalText(300),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.issueDate !== undefined && data.dueDate !== undefined && data.issueDate > data.dueDate) {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Due date cannot be before the issue date" })
    }
  })

export const listLoansQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["active", "overdue", "returned"]).optional(),
  search: optionalParam(z.string().trim().min(1).max(100)),
  bookId: optionalParam(z.string().trim().min(1).max(64)),
  borrowerType: optionalParam(borrowerTypeSchema),
  borrowerId: optionalParam(z.string().trim().min(1).max(64)),
})

export type CreateBookInput = z.infer<typeof createBookSchema>
export type UpdateBookInput = z.infer<typeof updateBookSchema>
export type ListBooksQuery = z.infer<typeof listBooksQuerySchema>
export type CreateCopyInput = z.infer<typeof createCopySchema>
export type UpdateCopyStatusInput = z.infer<typeof updateCopyStatusSchema>
export type ListCopiesQuery = z.infer<typeof listCopiesQuerySchema>
export type ListBorrowersQuery = z.infer<typeof listBorrowersQuerySchema>
export type IssueLoanInput = z.infer<typeof issueLoanSchema>
export type ListLoansQuery = z.infer<typeof listLoansQuerySchema>