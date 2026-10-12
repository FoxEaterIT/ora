import { PrismaClient } from "@prisma/client";
import { IS_PRODUCTION } from "./server-config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (!IS_PRODUCTION) globalForPrisma.prisma = prisma;
