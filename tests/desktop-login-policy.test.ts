import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { desktopLoginKey, hashDesktopToken } from "../src/lib/desktop-session";
import { clearDesktopLoginFailures, desktopLoginDelay, recordDesktopLoginFailure } from "../src/lib/desktop-login-throttle";
import { desktopRouteDecision } from "../src/lib/desktop-route-policy";

test("desktop bearer hashes and rate-limit keys do not expose raw credentials", () => {
  const token = "sensitive-desktop-token";
  const email = "Person@example.test";
  assert.notEqual(hashDesktopToken(token), token);
  assert.equal(desktopLoginKey("127.0.0.1", email), desktopLoginKey("127.0.0.1", "person@example.test"));
  assert.equal(desktopLoginKey("127.0.0.1", email).includes(email), false);
});

test("desktop endpoint policy allows only contract paths and methods", () => {
  assert.equal(desktopRouteDecision("/api/projects", "POST"), true);
  assert.equal(desktopRouteDecision("/api/projects/p1", "PATCH"), true);
  assert.equal(desktopRouteDecision("/api/projects/p1", "DELETE"), true);
  assert.equal(desktopRouteDecision("/api/entries?mine=1", "GET"), true);
  assert.equal(desktopRouteDecision("/api/entries", "GET"), false);
  assert.equal(desktopRouteDecision("/api/entries/e1", "DELETE"), true);
  assert.equal(desktopRouteDecision("/api/teams", "GET"), true);
  assert.equal(desktopRouteDecision("/api/teams", "POST"), false);
  assert.equal(desktopRouteDecision("/api/teams/t1", "DELETE"), false);
  assert.equal(desktopRouteDecision("/api/export", "GET"), false);
  assert.equal(desktopRouteDecision("/api/account", "PATCH"), false);
  assert.equal(desktopRouteDecision("/api/desktop/handoff", "POST"), false);
  assert.equal(desktopRouteDecision("/api/projects?p1", "GET"), false);
});

test("persistent desktop login failure records use increasing bounded delays and clear on success", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-desktop-throttle-test-"));
  const db = new PrismaClient({ datasourceUrl: `file:${path.join(directory, "test.db")}` });
  try {
    await db.$executeRawUnsafe('CREATE TABLE "DesktopLoginAttempt" ("key" TEXT PRIMARY KEY, "failures" INTEGER NOT NULL DEFAULT 0, "blockedUntil" DATETIME NOT NULL, "updatedAt" DATETIME NOT NULL)');
    const ip = "192.0.2.1", email = "person@example.test";
    await recordDesktopLoginFailure(ip, email, db);
    const first = await db.desktopLoginAttempt.findUniqueOrThrow({ where: { key: desktopLoginKey(ip, email) } });
    assert.ok(await desktopLoginDelay(ip, email, db) > 0);
    await recordDesktopLoginFailure(ip, email, db);
    const second = await db.desktopLoginAttempt.findUniqueOrThrow({ where: { key: desktopLoginKey(ip, email) } });
    assert.equal(second.failures, 2);
    assert.ok(second.blockedUntil > first.blockedUntil);
    await clearDesktopLoginFailures(ip, email, db);
    assert.equal(await db.desktopLoginAttempt.count(), 0);
  } finally {
    await db.$disconnect();
    await rm(directory, { recursive: true, force: true });
  }
});
