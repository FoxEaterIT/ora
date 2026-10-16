import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import ExcelJS from "exceljs";
import { unzipSync } from "fflate";
import { test } from "node:test";
import { buildFullBackupZip, uniqueBackupSheetName } from "../src/lib/full-backup";
import { backupAuthorization } from "../src/lib/backup-policy";

test("complete backups are restricted to the owner", () => {
  assert.equal(backupAuthorization(null), "unauthorized");
  assert.equal(backupAuthorization("USER"), "forbidden");
  assert.equal(backupAuthorization("ADMIN"), "forbidden");
  assert.equal(backupAuthorization("OWNER"), null);
});

const date = new Date("2026-10-16T09:00:00.000Z");

test("full backup contains three Excel workbooks with related time entries", async () => {
  const archive = await buildFullBackupZip({
    projects: [{ id: "p1", name: "Alpha", description: "Client work", color: "#123456", archived: false, team: { id: "t1", name: "Team One" }, entries: [{ id: "e1", user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" }, description: "Design", start: date, end: null }] }],
    people: [{ id: "u1", name: "Ada Lovelace", email: "ada@example.com", role: "USER", deactivatedAt: null, entries: [{ id: "e1", project: { id: "p1", name: "Alpha" }, description: "Design", start: date, end: null }] }],
    teams: [{ id: "t1", name: "Team One", description: "Delivery", color: "#654321", members: [{ user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" } }], projects: [{ id: "p1", name: "Alpha", entries: [{ id: "e1", user: { id: "u1", name: "Ada Lovelace", email: "ada@example.com" }, description: "Design", start: date, end: null }] }] }],
  });
  const files = unzipSync(Buffer.from(archive));
  assert.deepEqual(Object.keys(files).sort(), ["ora-people.xlsx", "ora-projects.xlsx", "ora-teams.xlsx"]);
  for (const name of Object.keys(files)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(files[name]) as never);
    assert.equal(workbook.worksheets.length, 2);
    const entriesSheet = workbook.worksheets[1];
    assert.equal(entriesSheet.getRow(2).getCell(1).value, "e1");
    assert.equal(entriesSheet.getRow(2).getCell(3).value, "Ada Lovelace");
  }
  const projectsBook = new ExcelJS.Workbook();
  await projectsBook.xlsx.load(Buffer.from(files["ora-projects.xlsx"]) as never);
  assert.equal(projectsBook.worksheets[0].getCell("A2").value, "Project ID");
  assert.equal(projectsBook.worksheets[0].getCell("B2").value, "p1");
});

test("empty datasets produce valid workbook sheets and worksheet names are safe and unique", async () => {
  const zip = unzipSync(Buffer.from(await buildFullBackupZip({ projects: [], people: [], teams: [] })));
  assert.equal(Object.keys(zip).length, 3);
  for (const data of Object.values(zip)) {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(data) as never);
    assert.equal(workbook.worksheets.length, 1);
  }
  const used = new Set<string>();
  const first = uniqueBackupSheetName("Invalid/Name", used, "Fallback");
  const duplicate = uniqueBackupSheetName("Invalid/Name", used, "Fallback");
  assert.equal(first, "Invalid-Name");
  assert.notEqual(duplicate, first);
  assert.ok(duplicate.length <= 31);
  const long = uniqueBackupSheetName("A very long project or person name beyond Excel limit", used, "Fallback");
  assert.ok(long.length <= 31);
});
