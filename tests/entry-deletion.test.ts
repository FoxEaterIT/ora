import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";
import { canDeleteEntry } from "../src/lib/entry-policy";

test("only the entry owner can delete, including when the actor is a manager", () => {
  assert.equal(canDeleteEntry("u-owner", "u-owner"), true);
  assert.equal(canDeleteEntry("u-admin", "u-admin"), true);
  assert.equal(canDeleteEntry("u-user", "u-user"), true);
  assert.equal(canDeleteEntry("u-admin", "u-user"), false);
  assert.equal(canDeleteEntry("u-owner", "u-admin"), false);
});

test("deleting an owned time entry removes it from subsequent reads", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-entry-delete-test-"));
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${path.join(directory, "test.db")}` }) });
  try {
    await prisma.$executeRawUnsafe("CREATE TABLE User (id TEXT PRIMARY KEY)");
    await prisma.$executeRawUnsafe("CREATE TABLE Project (id TEXT PRIMARY KEY)");
    await prisma.$executeRawUnsafe("CREATE TABLE TimeEntry (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES User(id), projectId TEXT NOT NULL REFERENCES Project(id))");
    await prisma.$executeRaw`INSERT INTO User (id) VALUES ('u1')`;
    await prisma.$executeRaw`INSERT INTO Project (id) VALUES ('p1')`;
    await prisma.$executeRaw`INSERT INTO TimeEntry (id, userId, projectId) VALUES ('e1', 'u1', 'p1')`;
    const before = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM TimeEntry WHERE userId = 'u1'`;
    assert.deepEqual(before.map((entry) => entry.id), ["e1"]);
    await prisma.$executeRaw`DELETE FROM TimeEntry WHERE id = 'e1' AND userId = 'u1'`;
    const after = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM TimeEntry WHERE userId = 'u1'`;
    assert.deepEqual(after, []);
  } finally {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
