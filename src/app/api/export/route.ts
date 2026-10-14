import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { zipSync, strToU8 } from "fflate";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isManager } from "@/lib/auth";
import { fullName } from "@/lib/users";
import { DEFAULT_LOCALE, getMessages, normalizeLocale, type Locale } from "@/i18n/messages";

const MAX_EXPORT_ROWS = 10000;
const MAX_EXPORT_COLUMNS = 10;

export function exportAuthorization(role: "OWNER" | "ADMIN" | "USER" | null) {
  if (!role) return "unauthorized" as const;
  if (!isManager(role)) return "forbidden" as const;
  return null;
}

export function exportAuthorizationResponse(role: "OWNER" | "ADMIN" | "USER" | null, messages: { unauthorized: string; forbidden: string }) {
  const error = exportAuthorization(role);
  if (!error) return null;
  return NextResponse.json({ error: messages[error] }, { status: error === "unauthorized" ? 401 : 403 });
}

export function exportLimitError(rowCount: number, columnCount: number) {
  if (rowCount > MAX_EXPORT_ROWS) return "maxRows" as const;
  if (columnCount > MAX_EXPORT_COLUMNS) return "maxColumns" as const;
  return null;
}

const FIELDS = [
  { key: "data", message: "date", width: 14 }, { key: "persona", message: "person", width: 24 },
  { key: "email", message: "email", width: 28 }, { key: "team", message: "team", width: 20 },
  { key: "progetto", message: "project", width: 24 }, { key: "attivita", message: "activity", width: 40 },
  { key: "inizio", message: "start", width: 20 }, { key: "fine", message: "end", width: 20 },
  { key: "ore", message: "duration", width: 14 }, { key: "nota", message: "note", width: 40 },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];
type ExportRow = Record<FieldKey, string | number>;
type Group = { id: string; name: string; rows: (ExportRow & { groupId: string; groupName: string })[] };

function fmt(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}
function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "item";
}
function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
function csvContent(rows: (ExportRow & { groupId: string; groupName: string })[], fields: { key: FieldKey; label: string; width: number }[], locale: string) {
  return "\uFEFF" + [fields.map((field) => csvCell(field.label)).join(";"), ...rows.map((row) => fields.map((field) => csvCell(field.key === "ore" ? String(row[field.key]).replace(".", locale === "it" || locale === "es" ? "," : ".") : row[field.key])).join(";"))].join("\r\n");
}
function uniqueSheetName(name: string, used: Set<string>, fallback: string) {
  const base = (name.replace(/[\\/*?:[\]]/g, "-").trim().slice(0, 31) || fallback);
  let result = base;
  let index = 2;
  while (used.has(result.toLocaleLowerCase())) {
    const suffix = ` (${index++})`;
    result = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(result.toLocaleLowerCase());
  return result;
}

export async function buildExportResponse(
  format: "csv" | "xlsx",
  rows: (ExportRow & { groupId: string; groupName: string })[],
  selectedColumns: { key: FieldKey; label: string; width: number }[],
  focus: "team" | "project" | "user",
  locale: Locale,
) {
  const t = getMessages(locale);
  const grouped = new Map<string, Group>();
  for (const row of rows) {
    if (!grouped.has(row.groupId)) grouped.set(row.groupId, { id: row.groupId, name: row.groupName, rows: [] });
    grouped.get(row.groupId)!.rows.push(row);
  }
  const groups = [...grouped.values()];
  const focusLabel = focus === "team" ? t.report.teamFile : focus === "user" ? t.report.userFile : t.report.projectFile;
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  if (format === "csv") {
    const files = groups.map((group) => ({ name: `ora-${focusLabel}-${safeName(group.name)}-${stamp}.csv`, data: csvContent(group.rows, selectedColumns, locale) }));
    if (files.length === 1) return new NextResponse(files[0].data, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${files[0].name}"` } });
    if (!files.length) return new NextResponse(csvContent([], selectedColumns, locale), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ora-${focusLabel}-${stamp}.csv"` } });
    const archive = zipSync(Object.fromEntries(files.map((file, index) => [`${String(index + 1).padStart(3, "0")}-${file.name}`, strToU8(file.data)])));
    return new NextResponse(archive, { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="ora-${focusLabel}-${stamp}.zip"` } });
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
  return new NextResponse(buffer, { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="ora-${focusLabel}-${stamp}.xlsx"` } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const locale = normalizeLocale(url.searchParams.get("locale")) ?? DEFAULT_LOCALE;
  const t = getMessages(locale);
  const fields = FIELDS.map((field) => ({ ...field, label: t.report[field.message] }));
  const me = await getCurrentUser();
  const authorizationResponse = exportAuthorizationResponse(me?.role ?? null, t.report);
  if (authorizationResponse) return authorizationResponse;
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const focus = ["team", "project", "user"].includes(url.searchParams.get("focus") ?? "") ? url.searchParams.get("focus")! : "project";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const userIds = [...new Set(url.searchParams.getAll("userId").filter(Boolean))];
  const includeDeactivated = url.searchParams.get("includeDeactivated") === "1";
  const projectIds = [...new Set(url.searchParams.getAll("projectId").filter(Boolean))];
  const teamIds = [...new Set(url.searchParams.getAll("teamId").filter(Boolean))];
  const selectedFields = [...new Set(url.searchParams.getAll("column"))].filter((key): key is FieldKey => FIELDS.some((field) => field.key === key));
  const selectedKeys = FIELDS.filter((field) => selectedFields.includes(field.key)).map((field) => field.key);
  const selectedColumns = fields.filter((field) => selectedKeys.includes(field.key));
  if (!selectedColumns.length) return NextResponse.json({ error: t.report.selectColumn }, { status: 400 });
  if ((from && Number.isNaN(Date.parse(from))) || (to && Number.isNaN(Date.parse(to)))) return NextResponse.json({ error: t.report.invalidDate }, { status: 400 });
  const columnLimitError = exportLimitError(0, selectedColumns.length);
  if (columnLimitError) return NextResponse.json({ error: t.report[columnLimitError] }, { status: 400 });

  const totalEntries = await prisma.timeEntry.count({
    where: {
      ...(userIds.length ? { userId: { in: userIds } } : {}),
      ...(includeDeactivated && userIds.length
        ? { user: { OR: [{ deactivatedAt: null }, { id: { in: userIds } }] } }
        : { user: { deactivatedAt: null } }),
      ...(projectIds.length ? { projectId: { in: projectIds } } : {}),
      ...(teamIds.length ? { project: { teamId: { in: teamIds } } } : {}),
      ...(from || to ? { start: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
  });
  const rowLimitError = exportLimitError(totalEntries, selectedColumns.length);
  if (rowLimitError) return NextResponse.json({ error: t.report[rowLimitError] }, { status: 400 });

  const dateLocale = locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "it-IT";
  const entries = await prisma.timeEntry.findMany({
    where: {
      ...(userIds.length ? { userId: { in: userIds } } : {}),
      ...(includeDeactivated && userIds.length
        ? { user: { OR: [{ deactivatedAt: null }, { id: { in: userIds } }] } }
        : { user: { deactivatedAt: null } }),
      ...(projectIds.length ? { projectId: { in: projectIds } } : {}),
      ...(teamIds.length ? { project: { teamId: { in: teamIds } } } : {}),
      ...(from || to ? { start: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { user: true, project: { include: { team: true } } },
    orderBy: [{ start: "asc" }, { id: "asc" }],
  });

  const rows: (ExportRow & { groupId: string; groupName: string })[] = entries.map((entry) => {
    const ms = Math.max(0, (entry.end?.getTime() ?? Date.now()) - entry.start.getTime());
    const group = focus === "team" ? { id: entry.project.team?.id ?? "no-team", name: entry.project.team?.name ?? t.report.noTeam }
      : focus === "user" ? { id: entry.userId, name: fullName(entry.user) }
      : { id: entry.projectId, name: entry.project.name };
    return {
      data: new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" }).format(entry.start),
      persona: fullName(entry.user), email: entry.user.email, team: entry.project.team?.name ?? "",
      progetto: entry.project.name, attivita: entry.description, inizio: fmt(entry.start, dateLocale), fine: entry.end ? fmt(entry.end, dateLocale) : t.report.inProgress,
      ore: Math.round((ms / 3_600_000) * 100) / 100, nota: entry.description, groupId: group.id, groupName: group.name,
    };
  });
  return buildExportResponse(format, rows, selectedColumns, focus as "team" | "project" | "user", locale);
}
