import { env } from "../config/env.js"

type Prisma = import("@prisma/client").PrismaClient

let prismaClient: Prisma | undefined

/**
 * Returns a lazily-initialized PrismaClient, or null when no DATABASE_URL is
 * configured. The server must boot and serve the health endpoint without a
 * database, so nothing here connects eagerly.
 */
export async function getPrisma(): Promise<Prisma | null> {
  if (!env.databaseUrl) {
    await disconnectDatabase()
    return null
  }
  if (!prismaClient) {
    const { PrismaClient } = await import("@prisma/client")
    prismaClient = new PrismaClient()
  }
  return prismaClient
}

export async function disconnectDatabase(): Promise<void> {
  if (prismaClient) {
    await prismaClient.$disconnect()
    prismaClient = undefined
  }
}