import { PrismaClient } from "@prisma/client";

/**
 * Shared Prisma client for server-side consumers. In development, reuse the
 * client across module reloads so local hot-reloading does not exhaust the
 * database connection pool.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";
export default prisma;
