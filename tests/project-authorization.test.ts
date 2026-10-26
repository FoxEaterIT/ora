import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "../src/generated/prisma/client";
import { canAssignProjectMembers, canCreateProject, canDeleteProject, canManageProjectMembers } from "../src/lib/project-policy";

test("project API authorization policy allows all roles to create and assign multiple members, while limiting deletion", () => {
  for (const role of ["OWNER", "ADMIN", "USER"]) assert.equal(canCreateProject(role), true);
  assert.equal(canCreateProject("UNKNOWN"), false);
  assert.equal(canManageProjectMembers("OWNER"), true);
  assert.equal(canManageProjectMembers("ADMIN"), true);
  assert.equal(canManageProjectMembers("USER"), true);
  assert.equal(canAssignProjectMembers("USER"), true);
  assert.equal(canAssignProjectMembers("USER"), true);
  assert.equal(canAssignProjectMembers("ADMIN"), true);
  assert.equal(canDeleteProject("ADMIN", 0), true);
  assert.equal(canDeleteProject("OWNER", 1), false);
  assert.equal(canDeleteProject("USER", 0), false);
});

test("SQLite supports multiple project members and restricts deleting projects with entries", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-project-test-"));
  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${path.join(directory, "test.db")}` }) });
  try {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
    await prisma.$executeRawUnsafe("CREATE TABLE Project (id TEXT PRIMARY KEY)");
    await prisma.$executeRawUnsafe("CREATE TABLE User (id TEXT PRIMARY KEY)");
    await prisma.$executeRawUnsafe("CREATE TABLE ProjectMember (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES Project(id) ON DELETE CASCADE, userId TEXT NOT NULL REFERENCES User(id) ON DELETE CASCADE, UNIQUE(projectId, userId))");
    await prisma.$executeRawUnsafe("CREATE TABLE TimeEntry (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES Project(id) ON DELETE RESTRICT)");
    await prisma.$executeRaw`INSERT INTO Project (id) VALUES ('p1'), ('p2')`;
    await prisma.$executeRaw`INSERT INTO User (id) VALUES ('u1'), ('u2')`;
    await prisma.$executeRaw`INSERT INTO ProjectMember (id, projectId, userId) VALUES ('pm1', 'p1', 'u1'), ('pm2', 'p1', 'u2')`;
    await prisma.$executeRaw`INSERT INTO TimeEntry (id, projectId) VALUES ('e1', 'p2')`;
    const members = await prisma.$queryRaw<{ total: bigint }[]>`SELECT COUNT(*) AS total FROM ProjectMember WHERE projectId = 'p1'`;
    assert.equal(Number(members[0].total), 2);
    await prisma.$executeRaw`DELETE FROM Project WHERE id = 'p1'`;
    await assert.rejects(prisma.$executeRaw`DELETE FROM Project WHERE id = 'p2'`);
    const remaining = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM Project ORDER BY id`;
    assert.deepEqual(remaining.map((row) => row.id), ["p2"]);
  } finally {
    await prisma.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
