import { PrismaClient } from "@prisma/client";
import { IS_PRODUCTION, ORA_TEST_DATABASE_URL } from "./server-config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient(
  ORA_TEST_DATABASE_URL ? { datasourceUrl: ORA_TEST_DATABASE_URL } : undefined,
);

if (!IS_PRODUCTION) globalForPrisma.prisma = prisma;
