import assert from "node:assert/strict";
import { test } from "node:test";
import { isManager } from "../src/lib/auth";
import { exportAuthorization, exportAuthorizationResponse } from "../src/app/api/export/route";

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
