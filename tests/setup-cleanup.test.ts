import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getOrCreateSetupCode, removeSetupCode, removeSetupCodeAfterCommit, verifySetupCode } from "../src/lib/setup-code";

test("post-commit setup cleanup failure is non-fatal", async () => {
  await assert.doesNotReject(removeSetupCodeAfterCommit(async () => { throw new Error("permission denied"); }));
});

test("setup code is reusable for first-access verification and removal is repeatable", async () => {
  const code = await getOrCreateSetupCode();
  assert.equal(code.length, 64);
  assert.equal(await verifySetupCode(code), true);
  await removeSetupCode();
  await removeSetupCode();
  assert.equal(await verifySetupCode(code), false);
});

test("setup-code file requests restrictive mode on creation", async () => {
  const code = await getOrCreateSetupCode();
  const contents = await readFile(path.join(process.cwd(), "owner-setup-code.txt"), "utf8");
  assert.equal(contents.trim(), code);
  // Windows does not expose POSIX permission bits; on POSIX, verify owner-only access.
  if (process.platform !== "win32") {
    const { mode } = await stat(path.join(process.cwd(), "owner-setup-code.txt"));
    assert.equal(mode & 0o077, 0);
  }
  await removeSetupCode();
});
