import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  DESKTOP_SESSION_TTL_MS,
  getDesktopUser,
  hashDesktopToken,
  issueDesktopSession,
  revokeDesktopSession,
  revokeDesktopSessionsForUser,
} from "../src/lib/desktop-session";

async function setupDb() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-desktop-session-test-"));
  const dbPath = path.join(directory, "test.db");
  const db = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  await db.$executeRawUnsafe('CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "firstName" TEXT NOT NULL DEFAULT \'\', "lastName" TEXT NOT NULL DEFAULT \'\', "passwordHash" TEXT, "deactivatedAt" DATETIME, "role" TEXT NOT NULL DEFAULT \'USER\', "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  await db.$executeRawUnsafe('CREATE TABLE "DesktopSession" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id"), "tokenHash" TEXT NOT NULL UNIQUE, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" DATETIME NOT NULL, "revokedAt" DATETIME, "revokeReason" TEXT)');
  await db.$executeRawUnsafe('CREATE UNIQUE INDEX "DesktopSession_one_active_per_user" ON "DesktopSession"("userId") WHERE "revokedAt" IS NULL');
  await db.user.create({ data: { id: "user-1", email: "one@example.test", passwordHash: "test-hash" } });
  return { directory, dbPath, db };
}

test("desktop sessions persist across Prisma clients and server-process restarts", async () => {
  const { directory, dbPath, db: first } = await setupDb();
  const token = await issueDesktopSession("user-1", first);
  await first.$disconnect();
  const restarted = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
  try {
    assert.equal((await getDesktopUser(token, restarted))?.id, "user-1");
  } finally {
    await restarted.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});

test("desktop sessions store token hashes, enforce one active session, revoke, expire, and reject deactivated accounts", async () => {
  const { directory, db: first } = await setupDb();
  const second = new PrismaClient({ datasourceUrl: `file:${path.join(directory, "test.db")}` });
  try {
    const token = await issueDesktopSession("user-1", first);
    const row = await first.desktopSession.findUniqueOrThrow({ where: { tokenHash: hashDesktopToken(token) } });
    assert.notEqual(row.tokenHash, token);
    assert.equal(row.expiresAt.getTime() - row.createdAt.getTime() >= DESKTOP_SESSION_TTL_MS - 1000, true);
    assert.equal((await getDesktopUser(token, second))?.id, "user-1");

    const replacement = await issueDesktopSession("user-1", first);
    assert.equal((await first.desktopSession.findUniqueOrThrow({ where: { tokenHash: hashDesktopToken(token) } })).revokeReason, "replaced");
    assert.equal(await first.desktopSession.count({ where: { userId: "user-1", revokedAt: null } }), 1);

    await revokeDesktopSessionsForUser("user-1", "password-changed", first);
    assert.equal((await first.desktopSession.findUniqueOrThrow({ where: { tokenHash: hashDesktopToken(replacement) } })).revokeReason, "password-changed");
    const logoutToken = await issueDesktopSession("user-1", first);
    await revokeDesktopSession(logoutToken, "logout", first);
    assert.equal((await first.desktopSession.findUniqueOrThrow({ where: { tokenHash: hashDesktopToken(logoutToken) } })).revokeReason, "logout");

    const expired = await issueDesktopSession("user-1", first);
    await first.desktopSession.update({ where: { tokenHash: hashDesktopToken(expired) }, data: { expiresAt: new Date(Date.now() - 1) } });
    assert.equal(await getDesktopUser(expired, first), null);
    assert.equal((await first.desktopSession.findUniqueOrThrow({ where: { tokenHash: hashDesktopToken(expired) } })).revokeReason, "expired");

    const deactivatedToken = await issueDesktopSession("user-1", first);
    await first.user.update({ where: { id: "user-1" }, data: { deactivatedAt: new Date() } });
    assert.equal(await getDesktopUser(deactivatedToken, first), null);
    assert.equal((await first.desktopSession.findUniqueOrThrow({ where: { tokenHash: hashDesktopToken(deactivatedToken) } })).revokeReason, "deactivated");
  } finally {
    await first.$disconnect();
    await second.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
