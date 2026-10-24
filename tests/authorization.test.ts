import assert from "node:assert/strict";
import { test } from "node:test";
import { isManager } from "../src/lib/auth";
import { canDeleteEntry } from "../src/lib/entry-policy";
import { exportAuthorization, exportAuthorizationResponse } from "../src/lib/export-authorization";

test("time entries can only be deleted by their owner, including managers", () => {
  assert.equal(canDeleteEntry("owner-1", "owner-1"), true);
  assert.equal(canDeleteEntry("admin-1", "admin-1"), true);
  assert.equal(canDeleteEntry("user-1", "user-1"), true);
  assert.equal(canDeleteEntry("admin-1", "user-1"), false);
  assert.equal(canDeleteEntry("owner-1", "admin-1"), false);
});

test("only owner and admin roles are managers", () => {
  assert.equal(isManager("OWNER"), true);
  assert.equal(isManager("ADMIN"), true);
  assert.equal(isManager("USER"), false);
});

test("export authorization distinguishes anonymous, standard, and manager roles", () => {
  assert.equal(exportAuthorization(null), "unauthorized");
  assert.equal(exportAuthorization("USER"), "forbidden");
  assert.equal(exportAuthorization("ADMIN"), null);
  assert.equal(exportAuthorization("OWNER"), null);
});

test("export authorization returns API 401 and 403 responses", async () => {
  const messages = { unauthorized: "Sign in", forbidden: "Manager only" };
  const anonymous = exportAuthorizationResponse(null, messages)!;
  const standard = exportAuthorizationResponse("USER", messages)!;
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { error: "Sign in" });
  assert.equal(standard.status, 403);
  assert.deepEqual(await standard.json(), { error: "Manager only" });
  assert.equal(exportAuthorizationResponse("ADMIN", messages), null);
});
