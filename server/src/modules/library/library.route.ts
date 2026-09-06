import { Router } from "express"
import { requireAuth } from "../../middleware/requireAuth.js"
import { requirePermission } from "../../middleware/requirePermission.js"
import {
  createBookHandler,
  createCopyHandler,
  getBookHandler,
  issueLoanHandler,
  listBooksHandler,
  listBorrowersHandler,
  listCopiesHandler,
  listLoansHandler,
  returnLoanHandler,
  updateBookHandler,
  updateCopyStatusHandler,
} from "./library.controller.js"

// Library module: catalogue + circulation, all tenant-scoped. There is
// intentionally NO destructive DELETE for books — they are deactivated via
// isActive (Students-module precedent) so copy/loan history survives.
export const libraryRouter: Router = Router()

libraryRouter.use(requireAuth)

// Books
libraryRouter.get("/books", requirePermission("library:view"), listBooksHandler)
libraryRouter.post("/books", requirePermission("library:create"), createBookHandler)
libraryRouter.get("/books/:id", requirePermission("library:view"), getBookHandler)
libraryRouter.patch("/books/:id", requirePermission("library:update"), updateBookHandler)

// Copies
libraryRouter.get("/copies", requirePermission("library:view"), listCopiesHandler)
libraryRouter.post("/copies", requirePermission("library:create"), createCopyHandler)
libraryRouter.patch("/copies/:id/status", requirePermission("library:update"), updateCopyStatusHandler)

// Borrowers (searchable ACTIVE students/teachers/staff)
libraryRouter.get("/borrowers", requirePermission("library:view"), listBorrowersHandler)

// Loans
libraryRouter.get("/loans", requirePermission("library:view"), listLoansHandler)
libraryRouter.post("/loans", requirePermission("library:issue"), issueLoanHandler)
libraryRouter.post("/loans/:id/return", requirePermission("library:return"), returnLoanHandler)