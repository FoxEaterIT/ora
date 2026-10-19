import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtemp, rm, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const root = process.cwd();
const nodeModules = path.join(root, "node_modules");
const prismaCli = path.join(nodeModules, "prisma", "build", "index.js");

async function waitForServer(url: string, child: ChildProcess) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.status > 0) return;
    } catch {
      // Server is still starting.
    }
    await delay(500);
  }
  throw new Error("Next server did not become ready within 90 seconds");
}

async function stopServer(child: ChildProcess) {
  if (child.exitCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    try { execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" }); } catch { /* Process may have exited. */ }
  } else {
    child.kill("SIGTERM");
  }
  await Promise.race([new Promise<void>((resolve) => child.once("exit", () => resolve())), delay(10_000)]);
}

test("desktop HTTP auth survives a Next process restart and enforces the contract", { timeout: 240_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ora-desktop-http-test-"));
  const prismaDir = path.join(directory, "prisma");
  await mkdir(prismaDir, { recursive: true });
  await cp(path.join(root, "prisma", "schema.prisma"), path.join(prismaDir, "schema.prisma"));
  await cp(path.join(root, "prisma", "migrations"), path.join(prismaDir, "migrations"), { recursive: true });
  const databasePath = path.join(directory, "ORA.db");
  const databaseUrl = `file:${databasePath.replaceAll("\\", "/")}`;
  let server: ChildProcess | undefined;
  const serverOutput: string[] = [];
  const port = 34000 + Math.floor(Math.random() * 1000);
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const originalPrismaSchema = await readFile(path.join(root, "prisma", "schema.prisma"), "utf8");
    await writeFile(path.join(prismaDir, "schema.prisma"), originalPrismaSchema.replace('url      = "file:./ORA.db"', `url      = "${databaseUrl}"`));
    execFileSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", path.join(prismaDir, "schema.prisma")], {
      cwd: root,
      env: { ...process.env },
      stdio: "pipe",
    });

    const seed = new PrismaClient({ datasourceUrl: databaseUrl });
    const passwordHash = await bcrypt.hash("test-password-123", 10);
    const owner = await seed.user.create({ data: { id: "http-owner", email: "owner-http@example.test", firstName: "Test", lastName: "Owner", passwordHash, role: "OWNER" } });
    const admin = await seed.user.create({ data: { id: "http-admin", email: "admin-http@example.test", firstName: "Test", lastName: "Admin", passwordHash, role: "ADMIN" } });
    const user = await seed.user.create({ data: { id: "http-user", email: "user-http@example.test", firstName: "Test", lastName: "User", passwordHash, role: "USER" } });
    const other = await seed.user.create({ data: { id: "http-other", email: "other-http@example.test", firstName: "Other", lastName: "Person", passwordHash, role: "USER" } });
    const team = await seed.team.create({ data: { name: "HTTP Team", description: "Private test team", color: "#123456", members: { create: [{ userId: user.id }, { userId: other.id }] } } });
    const project = await seed.project.create({ data: { name: "HTTP Project", teamId: team.id, members: { create: [{ userId: user.id }, { userId: other.id }] } } });
    const foreignEntry = await seed.timeEntry.create({ data: { userId: other.id, projectId: project.id, start: new Date("2026-10-17T09:00:00Z"), end: new Date("2026-10-17T10:00:00Z") } });
    await seed.$disconnect();

    const childEnv: NodeJS.ProcessEnv = { ...process.env, ORA_TEST_DATABASE_URL: databaseUrl, PORT: String(port), HOSTNAME: "127.0.0.1", AUTH_SECRET: "http-integration-secret-long-enough", OWNER_EMAIL: "", OWNER_PASSWORD: "", NODE_ENV: "development" };
    const launch = () => {
      const child = spawn(process.execPath, [path.join(nodeModules, "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, env: childEnv, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
      child.stdout?.on("data", (chunk) => serverOutput.push(chunk.toString()));
      child.stderr?.on("data", (chunk) => serverOutput.push(chunk.toString()));
      return child;
    };
    const request = (url: string, token?: string, init: RequestInit = {}) => fetch(`${baseUrl}${url}`, { ...init, headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { "x-ora-desktop-token": token } : {}), ...init.headers } });
    const login = async (email: string, password = "test-password-123") => {
      const response = await request("/api/desktop/login", undefined, { method: "POST", body: JSON.stringify({ email, password }) });
      return { response, body: await response.json() as { session?: string; error?: string; user?: { role: string } } };
    };

    server = launch();
    await waitForServer(baseUrl, server!);
    const bad = await login(user.email, "wrong-password");
    assert.equal(bad.response.status, 401);
    assert.match(bad.body.error ?? "", /incorrect/i);
    const unknown = await login("missing-http@example.test");
    assert.equal(unknown.response.status, bad.response.status);
    assert.equal(unknown.body.error, bad.body.error);

    const authenticated = await login(user.email);
    assert.equal(authenticated.response.status, 200);
    assert.equal(authenticated.response.headers.get("cache-control"), "no-store");
    const token = authenticated.body.session;
    assert.ok(token);
    assert.equal(authenticated.body.user?.role, "USER");

    const profile = await request("/api/desktop/config", token);
    assert.equal(profile.status, 200);
    assert.equal(profile.headers.get("cache-control"), "no-store");
    assert.ok((await profile.json() as { config: { name: string } }).config.name);

    const projects = await request("/api/projects", token);
    assert.equal(projects.status, 200);
    const createdProject = await request("/api/projects", token, { method: "POST", body: JSON.stringify({ name: "Created by desktop", memberIds: [user.id] }) });
    assert.equal(createdProject.status, 201);
    const createdProjectBody = await createdProject.json() as { project: { id: string } };
    const forbiddenUserTeam = await request(`/api/projects/${project.id}`, token, { method: "PATCH", body: JSON.stringify({ teamId: team.id }) });
    assert.equal(forbiddenUserTeam.status, 403);

    const teamsResponse = await request("/api/teams", token);
    assert.equal(teamsResponse.status, 200);
    const teamsBody = await teamsResponse.json() as { teams: Array<Record<string, unknown>> };
    assert.equal(teamsBody.teams.length, 1);
    assert.equal("color" in teamsBody.teams[0], false);
    assert.equal("_count" in teamsBody.teams[0], false);
    const teamMember = (teamsBody.teams[0].members as Array<{ user: Record<string, unknown> }>)[0];
    assert.equal("role" in teamMember.user, false);
    assert.equal("id" in teamMember.user, false);

    const ownEntries = await request("/api/entries?mine=1", token);
    assert.equal(ownEntries.status, 200);
    assert.equal(((await ownEntries.json()) as { entries: unknown[] }).entries.length, 0);
    assert.equal((await request("/api/entries", token)).status, 403);
    assert.equal((await request(`/api/entries/${foreignEntry.id}`, token, { method: "PATCH", body: JSON.stringify({ description: "No" }) })).status, 403);
    assert.equal((await request(`/api/entries/${foreignEntry.id}`, token, { method: "DELETE" })).status, 403);
    assert.ok([401, 403].includes((await request("/api/export", token)).status));
    assert.equal((await request("/api/teams", token, { method: "POST", body: JSON.stringify({ name: "Forbidden" }) })).status, 403);
    assert.equal((await request(`/api/desktop/config?unexpected=1`, token)).status, 403);

    const ownEntryResponse = await request("/api/entries", token, { method: "POST", body: JSON.stringify({ projectId: project.id, description: "My entry", start: "2026-10-17T11:00:00.000Z", end: "2026-10-17T12:00:00.000Z" }) });
    assert.equal(ownEntryResponse.status, 201);
    const ownEntry = (await ownEntryResponse.json() as { entry: { id: string } }).entry;
    assert.equal((await request(`/api/entries/${ownEntry.id}`, token, { method: "PATCH", body: JSON.stringify({ description: "Updated" }) })).status, 200);
    assert.equal((await request(`/api/entries/${ownEntry.id}`, token, { method: "DELETE" })).status, 200);
    assert.equal((await request(`/api/projects/${createdProjectBody.project.id}`, token, { method: "DELETE" })).status, 403);

    const manager = await login(admin.email);
    assert.equal(manager.response.status, 200);
    const managerToken = manager.body.session!;
    assert.equal((await request(`/api/projects/${project.id}`, managerToken, { method: "PATCH", body: JSON.stringify({ teamId: team.id, archived: true }) })).status, 200);
    assert.equal((await request(`/api/entries/${foreignEntry.id}`, managerToken, { method: "PATCH", body: JSON.stringify({ description: "must not edit" }) })).status, 403);
    assert.equal((await request(`/api/entries/${foreignEntry.id}`, managerToken, { method: "DELETE" })).status, 403);
    assert.equal((await request(`/api/projects/${project.id}`, managerToken, { method: "DELETE" })).status, 409);

    const allowedMethods: Array<[string, string, string?]> = [
      ["GET", "/api/projects"], ["POST", "/api/projects", JSON.stringify({ name: "Method test" })],
      ["GET", "/api/teams"], ["GET", "/api/entries?mine=1"],
    ];
    for (const [method, url, body] of allowedMethods) {
      const allowedResponse = await request(url, token, { method, ...(body ? { body } : {}) });
      assert.ok([200, 201, 400, 409].includes(allowedResponse.status), `${method} ${url} unexpectedly returned ${allowedResponse.status}. Server: ${serverOutput.slice(-30).join("")}`);
    }
    const forbiddenMethods: Array<[string, string, number]> = [["PATCH", "/api/teams", 405], ["DELETE", "/api/teams", 405], ["POST", "/api/desktop/config", 405], ["GET", "/api/desktop/logout", 405], ["GET", "/api/account", 405], ["POST", "/api/desktop/handoff", 403]];
    for (const [method, url, expected] of forbiddenMethods) assert.equal((await request(url, token, { method })).status, expected, `${method} ${url} should be denied`);

    await stopServer(server!);
    server = undefined;
    await delay(1000);
    server = launch();
    await waitForServer(baseUrl, server!);
    assert.equal((await request("/api/desktop/config", token)).status, 200, "session should survive server restart");

    const logout = await request("/api/desktop/logout", token, { method: "POST" });
    assert.equal(logout.status, 200);
    assert.equal((await request("/api/desktop/config", token)).status, 403, "revoked session must stop working");

    const ownerLogin = await login(owner.email);
    assert.equal(ownerLogin.response.status, 200);
    const ownerToken = ownerLogin.body.session!;
    assert.equal((await request(`/api/projects/${project.id}`, ownerToken, { method: "DELETE" })).status, 409);
    assert.ok([401, 403].includes((await request("/api/users", ownerToken)).status));
  } finally {
    if (server) await stopServer(server);
    await delay(500);
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 1000 });
  }
});
