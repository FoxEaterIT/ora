import assert from "node:assert/strict";
import { test } from "node:test";
import { canAssignProjectMembers, canDeleteProject } from "../src/lib/project-policy";
import { canDeleteEntry } from "../src/lib/entry-policy";
import { desktopRouteDecision } from "../src/lib/desktop-route-policy";

test("desktop project roles match the web policy, including manager team and archive controls", () => {
  for (const role of ["USER", "ADMIN", "OWNER"]) {
    assert.equal(canAssignProjectMembers(role), true);
    assert.equal(desktopRouteDecision("/api/projects/p1", "PATCH"), true);
  }
  assert.equal(canDeleteProject("USER", 0), false);
  assert.equal(canDeleteProject("ADMIN", 0), true);
  assert.equal(canDeleteProject("OWNER", 1), false);
  assert.equal(desktopRouteDecision("/api/projects/p1", "DELETE"), true);
});

test("desktop entry edits stay on the contract fields and only the owner can delete", () => {
  assert.equal(desktopRouteDecision("/api/entries/e1", "PATCH"), true);
  assert.equal(desktopRouteDecision("/api/entries/e1?userId=other", "PATCH"), false);
  assert.equal(canDeleteEntry("owner", "owner"), true);
  assert.equal(canDeleteEntry("admin", "owner"), false);
});

test("desktop team reads stay on the collection and hide management routes", () => {
  assert.equal(desktopRouteDecision("/api/teams", "GET"), true);
  assert.equal(desktopRouteDecision("/api/teams", "POST"), false);
  assert.equal(desktopRouteDecision("/api/teams/t1", "PATCH"), false);
  assert.equal(desktopRouteDecision("/api/teams/t1", "DELETE"), false);
});
