import assert from "node:assert/strict";
import { test } from "node:test";
import { exportLimitError, buildExportResponse } from "../src/app/api/export/route";

test("report export row limit accepts 10,000 and rejects 10,001", () => {
  assert.equal(exportLimitError(9_999, 1), null);
  assert.equal(exportLimitError(10_000, 1), null);
  assert.equal(exportLimitError(10_001, 1), "maxRows");
});

test("report export column limit accepts 10 and rejects 11", () => {
  assert.equal(exportLimitError(0, 9), null);
  assert.equal(exportLimitError(0, 10), null);
  assert.equal(exportLimitError(0, 11), "maxColumns");
});

test("CSV and XLSX response builder returns expected media types", async () => {
  const columns = [{ key: "data" as const, label: "Date", width: 14 }];
  const rows = [{ data: "01/01/2026", persona: "A Person", email: "a@example.com", team: "", progetto: "Alpha", attivita: "work", inizio: "09:00", fine: "10:00", ore: 1, nota: "", groupId: "a", groupName: "Alpha" }];
  const csv = await buildExportResponse("csv", rows, columns, "project", "en");
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.match(await csv.text(), /Date/);

  const xlsx = await buildExportResponse("xlsx", rows, columns, "project", "en");
  assert.equal(xlsx.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.ok((await xlsx.arrayBuffer()).byteLength > 0);
});

test("multiple CSV groups produce a ZIP response", async () => {
  const columns = [{ key: "data" as const, label: "Date", width: 14 }];
  const rows = [
    { data: "one", persona: "A Person", email: "a@example.com", team: "", progetto: "Alpha", attivita: "work", inizio: "09:00", fine: "10:00", ore: 1, nota: "", groupId: "a", groupName: "Alpha" },
    { data: "two", persona: "B Person", email: "b@example.com", team: "", progetto: "Beta", attivita: "work", inizio: "09:00", fine: "10:00", ore: 2, nota: "", groupId: "b", groupName: "Beta" },
  ];
  const response = await buildExportResponse("csv", rows, columns, "project", "en");
  assert.equal(response.headers.get("content-type"), "application/zip");
  assert.ok((await response.arrayBuffer()).byteLength > 0);
});

 test("export limit errors are returned before format response materialization", async () => {
  assert.equal(exportLimitError(10_001, 1), "maxRows");
  assert.equal(exportLimitError(1, 11), "maxColumns");
});
