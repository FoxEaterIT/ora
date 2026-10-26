import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { IS_PRODUCTION, ORA_TEST_DATABASE_URL } from "./server-config";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const databaseUrl = ORA_TEST_DATABASE_URL || "file:./prisma/ORA.db";
const adapter = new PrismaBetterSqlite3({ url: databaseUrl, timestampFormat: "unixepoch-ms" });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (!IS_PRODUCTION) globalForPrisma.prisma = prisma;
