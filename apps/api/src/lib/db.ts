import { PrismaClient } from "@chat/db";

// Single PrismaClient for the whole API process. Multiple `new PrismaClient()`
// calls each open their own connection pool, which exhausts Postgres
// connections under load. Cache on globalThis so dev hot-reload (tsx watch)
// does not leak a new pool on every reload.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
