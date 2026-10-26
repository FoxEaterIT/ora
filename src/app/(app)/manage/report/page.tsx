"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, Checkbox, Empty, Field, Input, PageHeader, Select } from "@/components/ui";
import { entryDuration, formatDuration, hours } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";

type Entry = {
  id: string; description: string; start: string; end: string | null;
  user: { id: string; name: string };
  project: { id: string; name: string; color: string; team: { id: string; name: string } | null };
};
type Option = { id: string; name: string };
const COLUMNS = [
  ["date", "date"], ["person", "person"], ["email", "email"], ["team", "team"], ["project", "project"],
  ["activity", "activity"], ["start", "start"], ["end", "end"], ["duration", "duration"], ["note", "note"],
] as const;

export default function ReportPage() {
  const { locale, messages } = useI18n();
  const report = messages.report;
  const columnLabels = { date: report.date, person: report.person, email: report.email, team: report.team, project: report.project, activity: report.activity, start: report.start, end: report.end, duration: report.duration, note: report.note };
  const [entries, setEntries] = useState<Entry[]>([]);
  const [users, setUsers] = useState<Option[]>([]);
  const [projects, setProjects] = useState<Option[]>([]);
  const [teams, setTeams] = useState<Option[]>([]);
  const [focus, setFocus] = useState("project");
  const [columns, setColumns] = useState<string[]>(COLUMNS.map(([key]) => key));
  const [filters, setFilters] = useState({ from: "", to: "", userIds: [] as string[], projectIds: [] as string[], teamIds: [] as string[] });

  useEffect(() => {
    Promise.all([fetch("/api/users?includeDeactivated=1").then((r) => r.json()), fetch("/api/projects").then((r) => r.json()), fetch("/api/teams").then((r) => r.json())]).then(([u, p, t]) => {
      setUsers((u.users ?? []).map((user: { id: string; name?: string; firstName?: string; lastName?: string; email: string }) => ({ id: user.id, name: user.name || `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email })));
      setProjects((p.projects ?? []).map((project: Option) => ({ id: project.id, name: project.name })));
      setTeams((t.teams ?? []).map((team: Option) => ({ id: team.id, name: team.name })));
    });
  }, []);

  const filterParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("locale", locale);
    params.set("includeDeactivated", "1");
    if (filters.from) params.set("from", new Date(filters.from).toISOString());
    if (filters.to) params.set("to", new Date(filters.to + "T23:59:59.999").toISOString());
    filters.userIds.forEach((id) => params.append("userId", id));
    filters.projectIds.forEach((id) => params.append("projectId", id));
    filters.teamIds.forEach((id) => params.append("teamId", id));
    return params;
  }, [filters, locale]);

  useEffect(() => {
    fetch(`/api/entries?${filterParams}`).then((r) => r.json()).then((data) => setEntries(data.entries ?? []));
  }, [filterParams]);

  const total = useMemo(() => entries.reduce((sum, entry) => sum + entryDuration(entry.start, entry.end), 0), [entries]);
  const byPerson = group(entries, (e) => e.user.name);
  const byProject = group(entries, (e) => e.project.name);
  const byTeam = group(entries, (e) => e.project.team?.name ?? report.noTeam);

  function exportHref(format: "xlsx" | "csv") {
    const params = new URLSearchParams(filterParams);
    params.set("format", format);
    params.set("locale", locale);
    params.set("focus", focus);
    columns.forEach((column) => params.append("column", column));
    return `/api/export?${params}`;
  }
  function toggleFilter(key: "userIds" | "projectIds" | "teamIds", id: string) {
    setFilters((current) => ({ ...current, [key]: current[key].includes(id) ? current[key].filter((item) => item !== id) : [...current[key], id] }));
  }
  function multiSelect(label: string, options: Option[], selected: string[], key: "userIds" | "projectIds" | "teamIds") {
    return <Field label={label}><div className="max-h-36 overflow-y-auto rounded-xl border border-line bg-bg p-2">{options.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 px-1 py-1 text-sm"><Checkbox checked={selected.includes(option.id)} onChange={() => toggleFilter(key, option.id)} />{option.name}</label>)}</div></Field>;
  }

  return (
    <div>
      <PageHeader title={report.title} subtitle={`${new Intl.NumberFormat(locale).format(hours(total))} ${report.hours} · ${entries.length} ${report.entries}`} action={<div className="flex gap-2"><a href={exportHref("xlsx")}><Button><Download size={16} /> {messages.report.excel}</Button></a><a href={exportHref("csv")}><Button variant="ghost">{messages.report.csv}</Button></a></div>} />
      <Card className="mb-5">
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <Field label={report.from}><Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></Field>
          <Field label={report.to}><Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></Field>
          <Field label={report.groupBy}><Select value={focus} onChange={(e) => setFocus(e.target.value)}><option value="project">{report.project}</option><option value="team">{report.team}</option><option value="user">{report.user}</option></Select></Field>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {multiSelect(report.selectPeople, users, filters.userIds, "userIds")}
          {multiSelect(messages.projects, projects, filters.projectIds, "projectIds")}
          {multiSelect(report.team, teams, filters.teamIds, "teamIds")}
        </div>
        <fieldset className="mt-4 border-t border-line pt-3">
          <legend className="mb-1 text-sm font-semibold text-ink">{report.columns}</legend>
          <p className="mb-3 text-xs text-muted">{report.columnsHelp}</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{COLUMNS.map(([key, messageKey]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-line/80 bg-surface/65 px-3 py-2 text-sm text-ink shadow-sm backdrop-blur-md transition hover:border-brand/40 hover:bg-surface/90"><Checkbox checked={columns.includes(key)} onChange={() => setColumns((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])} />{columnLabels[messageKey as keyof typeof columnLabels]}</label>)}</div>
        </fieldset>
        <p className="mt-3 text-xs text-muted">{report.filterHelp}</p>
      </Card>
      <div className="mb-5 grid gap-4 md:grid-cols-3"><Summary title={report.byPerson} rows={byPerson} max={total} locale={locale} /><Summary title={report.byProject} rows={byProject} max={total} locale={locale} /><Summary title={report.byTeam} rows={byTeam} max={total} locale={locale} /></div>
      {entries.length === 0 ? <Empty>{report.empty}</Empty> : <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-line text-xs uppercase tracking-wide text-muted"><tr><th className="px-4 py-3 font-medium">{report.person}</th><th className="px-4 py-3 font-medium">{report.project}</th><th className="px-4 py-3 font-medium">{report.activity}</th><th className="px-4 py-3 font-medium">{report.durationShort}</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className="border-b border-line last:border-0"><td className="px-4 py-3">{entry.user.name}</td><td className="px-4 py-3"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: entry.project.color }} />{entry.project.name}</td><td className="px-4 py-3 text-muted">{entry.description || "—"}</td><td className="px-4 py-3 font-mono">{formatDuration(entryDuration(entry.start, entry.end))}</td></tr>)}</tbody></table></div>}
    </div>
  );
}

function group(entries: Entry[], key: (entry: Entry) => string) {
  const map = new Map<string, number>();
  for (const entry of entries) { const name = key(entry); map.set(name, (map.get(name) ?? 0) + entryDuration(entry.start, entry.end)); }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
function Summary({ title, rows, max, locale }: { title: string; rows: [string, number][]; max: number; locale: "en" | "it" | "es" }) {
  return <Card><h2 className="mb-3 text-sm font-medium text-muted">{title}</h2>{rows.length === 0 ? <p className="text-sm text-muted">—</p> : <div className="flex flex-col gap-3">{rows.slice(0, 6).map(([name, ms]) => <div key={name}><div className="mb-1 flex justify-between text-sm"><span className="truncate">{name}</span><span className="font-mono text-muted">{new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(hours(ms))} h</span></div><div className="h-1.5 overflow-hidden rounded-full bg-bg"><div className="h-full rounded-full bg-brand" style={{ width: `${max ? (ms / max) * 100 : 0}%` }} /></div></div>)}</div>}</Card>;
}
