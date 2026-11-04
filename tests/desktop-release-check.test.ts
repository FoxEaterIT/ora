import assert from "node:assert/strict";
import { test } from "node:test";
import { getDesktopRelease, parseDesktopChecksums, resetDesktopReleaseCacheForTests } from "../src/lib/desktop-release-check";

test("desktop release lookup reports GitHub HTTP failures without throwing", async () => {
  resetDesktopReleaseCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    assert.deepEqual(await getDesktopRelease(), { githubUnavailable: true });
  } finally {
    globalThis.fetch = originalFetch;
    resetDesktopReleaseCacheForTests();
  }
});

test("desktop release lookup reports network failures without blocking callers", async () => {
  resetDesktopReleaseCacheForTests();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new TypeError("network unavailable"); };
  try {
    assert.deepEqual(await getDesktopRelease(), { githubUnavailable: true });
  } finally {
    globalThis.fetch = originalFetch;
    resetDesktopReleaseCacheForTests();
  }
});

test("desktop release checksum parser accepts only valid SHA-256 manifest lines", () => {
  const valid = "a".repeat(64);
  const parsed = parseDesktopChecksums(`${valid}  ora-desktop-v2.1.0.msi\ninvalid  bad.exe\n${"b".repeat(63)}  short.exe\n`);
  assert.equal(parsed.get("ora-desktop-v2.1.0.msi"), valid);
  assert.equal(parsed.has("bad.exe"), false);
  assert.equal(parsed.has("short.exe"), false);
});
