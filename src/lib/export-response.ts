import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import { getMessages, type Locale } from "@/i18n/messages";

type FieldKey = "data" | "persona" | "email" | "team" | "progetto" | "attivita" | "inizio" | "fine" | "ore" | "nota";
export type ExportRow = Record<FieldKey, string | number>;
export type ExportGroupRow = ExportRow & { groupId: string; groupName: string };
export type ExportColumn = { key: FieldKey; label: string; width: number };

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
}
function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
function csvContent(rows: ExportGroupRow[], fields: ExportColumn[], locale: string) {
  return "\uFEFF" + [fields.map((field) => csvCell(field.label)).join(";"), ...rows.map((row) => fields.map((field) => csvCell(field.key === "ore" ? String(row[field.key]).replace(".", locale === "it" || locale === "es" ? "," : ".") : row[field.key])).join(";"))].join("\r\n");
}
function uniqueSheetName(name: string, used: Set<string>, fallback: string) {
  const base = name.replace(/[\\/*?:[\]]/g, "-").trim().slice(0, 31) || fallback;
  let result = base;
  let index = 2;
  while (used.has(result.toLocaleLowerCase())) {
    const suffix = ` (${index++})`;
    result = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(result.toLocaleLowerCase());
  return result;
}

export async function buildExportResponse(format: "csv" | "xlsx", rows: ExportGroupRow[], selectedColumns: ExportColumn[], focus: "team" | "project" | "user", locale: Locale) {
  const t = getMessages(locale);
  const grouped = new Map<string, { id: string; name: string; rows: ExportGroupRow[] }>();
  for (const row of rows) {
    if (!grouped.has(row.groupId)) grouped.set(row.groupId, { id: row.groupId, name: row.groupName, rows: [] });
    grouped.get(row.groupId)!.rows.push(row);
  }
  const groups = [...grouped.values()];
  const focusLabel = focus === "team" ? t.report.teamFile : focus === "user" ? t.report.userFile : t.report.projectFile;
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  if (format === "csv") {
    const files = groups.map((group) => ({ name: `ora-${focusLabel}-${safeName(group.name)}-${stamp}.csv`, data: csvContent(group.rows, selectedColumns, locale) }));
    if (files.length === 1) return new Response(files[0].data, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${files[0].name}"` } });
    if (!files.length) return new Response(csvContent([], selectedColumns, locale), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ora-${focusLabel}-${stamp}.csv"` } });
    const archive = zipSync(Object.fromEntries(files.map((file, index) => [`${String(index + 1).padStart(3, "0")}-${file.name}`, strToU8(file.data)])));
    return new Response(archive, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="ora-${focusLabel}-${stamp}.zip"` } });
  }

  const workbook = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const group of groups) {
    const sheet = workbook.addWorksheet(uniqueSheetName(group.name, used, t.report.noData));
    sheet.columns = selectedColumns.map((field) => ({ header: field.label, key: field.key, width: field.width }));
    sheet.addRows(group.rows.map((row) => Object.fromEntries(selectedColumns.map((field) => [field.key, row[field.key]]))));
    sheet.getRow(1).font = { bold: true };
    if (selectedColumns.some((field) => field.key === "ore")) sheet.getColumn(selectedColumns.findIndex((field) => field.key === "ore") + 1).numFmt = "0.00";
  }
  if (!groups.length) {
    const sheet = workbook.addWorksheet(t.report.noData);
    sheet.columns = selectedColumns.map((field) => ({ header: field.label, key: field.key, width: field.width }));
    sheet.getRow(1).font = { bold: true };
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="ora-${focusLabel}-${stamp}.xlsx"` } });
}
