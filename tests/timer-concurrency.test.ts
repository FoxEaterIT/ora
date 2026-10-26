import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "../src/generated/prisma/client";

const migrationPath = path.join(process.cwd(), "prisma/migrations/20261015120000_one_running_timer_per_user/migration.sql");

test("SQLite allows only one open time entry per user", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-timer-test-"));
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${path.join(directory, "test.db")}` }) });

  try {
    await prisma.$executeRawUnsafe(`CREATE TABLE TimeEntry (id TEXT PRIMARY KEY, userId TEXT NOT NULL, end DATETIME)`);
    await readFile(migrationPath);
    const migration = await readFile(migrationPath, "utf8");
    await prisma.$executeRawUnsafe(migration);

    const attempts = await Promise.allSettled([
      prisma.$executeRaw`INSERT INTO TimeEntry (id, userId, end) VALUES ('a', 'user-1', NULL)`,
      prisma.$executeRaw`INSERT INTO TimeEntry (id, userId, end) VALUES ('b', 'user-1', NULL)`,
    ]);

    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);

    await prisma.$executeRaw`INSERT INTO TimeEntry (id, userId, end) VALUES ('completed', 'user-1', '2026-10-15T10:00:00Z')`;
  } finally {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
