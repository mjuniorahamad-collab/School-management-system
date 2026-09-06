import type { RequestHandler } from "express"
import { ok } from "../../lib/response.js"
import type { AuthUser } from "../../types/auth.js"
import { parseWithZod } from "../../lib/validation.js"
import {
  createBookSchema,
  createCopySchema,
  issueLoanSchema,
  listBooksQuerySchema,
  listBorrowersQuerySchema,
  listCopiesQuerySchema,
  listLoansQuerySchema,
  updateBookSchema,
  updateCopyStatusSchema,
} from "./library.schema.js"
import * as libraryService from "./library.service.js"

function requireAuth(req: { auth?: AuthUser }): AuthUser {
  if (!req.auth) throw new Error("Expected authenticated request")
  return req.auth
}

function routeParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ""
  return value ?? ""
}

// Books

export const listBooksHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listBooksQuerySchema, req.query, "Invalid books list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await libraryService.listBooks(query, schoolId)))
}

export const getBookHandler: RequestHandler = async (req, res) => {
  const schoolId = requireAuth(req).school.id
  res.json(ok(await libraryService.getBookById(routeParam(req.params.id), schoolId)))
}

export const createBookHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createBookSchema, req.body, "Invalid book data")
  const auth = requireAuth(req)
  const created = await libraryService.createBook(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateBookHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateBookSchema, req.body, "Invalid book data")
  const auth = requireAuth(req)
  const updated = await libraryService.updateBook(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}

// Copies

export const listCopiesHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listCopiesQuerySchema, req.query, "Invalid copies list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await libraryService.listCopies(query, schoolId)))
}

export const createCopyHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(createCopySchema, req.body, "Invalid copy data")
  const auth = requireAuth(req)
  const created = await libraryService.createCopy(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const updateCopyStatusHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(updateCopyStatusSchema, req.body, "Invalid copy status data")
  const auth = requireAuth(req)
  const updated = await libraryService.updateCopyStatus(routeParam(req.params.id), input, auth.school.id, auth)
  res.json(ok(updated))
}

// Borrowers

export const listBorrowersHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listBorrowersQuerySchema, req.query, "Invalid borrowers list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await libraryService.listBorrowers(query, schoolId)))
}

// Loans

export const listLoansHandler: RequestHandler = async (req, res) => {
  const query = parseWithZod(listLoansQuerySchema, req.query, "Invalid loans list query")
  const schoolId = requireAuth(req).school.id
  res.json(ok(await libraryService.listLoans(query, schoolId)))
}

export const issueLoanHandler: RequestHandler = async (req, res) => {
  const input = parseWithZod(issueLoanSchema, req.body, "Invalid loan data")
  const auth = requireAuth(req)
  const created = await libraryService.issueLoan(input, auth.school.id, auth)
  res.status(201).json(ok(created))
}

export const returnLoanHandler: RequestHandler = async (req, res) => {
  const auth = requireAuth(req)
  const updated = await libraryService.returnLoan(routeParam(req.params.id), auth.school.id, auth)
  res.json(ok(updated))
}