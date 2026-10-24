import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { requestMessages } from "@/i18n/request";
import { exportAuthorizationResponse } from "@/lib/export-authorization";
import { exportLimitError } from "@/lib/export-limits";
import { buildExportResponse, type ExportGroupRow } from "@/lib/export-response";
import { fullName } from "@/lib/users";
import { DEFAULT_LOCALE, getMessages, normalizeLocale } from "@/i18n/messages";

const FIELDS = [
  { key: "data", message: "date", width: 14 }, { key: "persona", message: "person", width: 24 },
  { key: "email", message: "email", width: 28 }, { key: "team", message: "team", width: 20 },
  { key: "progetto", message: "project", width: 24 }, { key: "attivita", message: "activity", width: 40 },
  { key: "inizio", message: "start", width: 20 }, { key: "fine", message: "end", width: 20 },
  { key: "ore", message: "duration", width: 14 }, { key: "nota", message: "note", width: 40 },
] as const;
type FieldKey = (typeof FIELDS)[number]["key"];

function fmt(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(date);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (request.headers.has("x-ora-desktop-token")) return NextResponse.json({ error: (await requestMessages()).api.forbidden }, { status: 403, headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
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

  const dateLocale = locale === "en" ? "en-US" : locale === "es" ? "es-ES" : "it-IT";
  const entries = await prisma.timeEntry.findMany({
    where: {
      ...(userIds.length ? { userId: { in: userIds } } : {}),
      ...(includeDeactivated && userIds.length ? { user: { OR: [{ deactivatedAt: null }, { id: { in: userIds } }] } } : { user: { deactivatedAt: null } }),
      ...(projectIds.length ? { projectId: { in: projectIds } } : {}),
      ...(teamIds.length ? { project: { teamId: { in: teamIds } } } : {}),
      ...(from || to ? { start: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    },
    include: { user: true, project: { include: { team: true } } },
    orderBy: [{ start: "asc" }, { id: "asc" }],
  });
  const rowCountError = exportLimitError(entries.length, selectedColumns.length);
  if (rowCountError) return NextResponse.json({ error: t.report[rowCountError] }, { status: 400 });

  const rows: ExportGroupRow[] = entries.map((entry): ExportGroupRow => {
    const ms = Math.max(0, (entry.end?.getTime() ?? Date.now()) - entry.start.getTime());
    const group = focus === "team" ? { id: entry.project.team?.id ?? "no-team", name: entry.project.team?.name ?? t.report.noTeam }
      : focus === "user" ? { id: entry.userId, name: fullName(entry.user) }
      : { id: entry.projectId, name: entry.project.name };
    const description = entry.description;
    return {
      data: new Intl.DateTimeFormat(dateLocale, { dateStyle: "short" }).format(entry.start),
      persona: fullName(entry.user), email: entry.user.email, team: entry.project.team?.name ?? "",
      progetto: entry.project.name, attivita: description, inizio: fmt(entry.start, dateLocale), fine: entry.end ? fmt(entry.end, dateLocale) : t.report.inProgress,
      ore: Math.round((ms / 3_600_000) * 100) / 100, nota: description, groupId: group.id, groupName: group.name,
    };
  });
  return buildExportResponse(format, rows, selectedColumns, focus as "team" | "project" | "user", locale);
}
