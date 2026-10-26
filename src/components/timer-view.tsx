"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Pause, Play, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
import { entryDuration, formatDuration, toLocalInput } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";

export type TimerProject = { id: string; name: string; color: string; team?: { name: string } | null };
type Project = TimerProject;
export type TimerApi = { request<T>(path: string, init?: RequestInit): Promise<T> };
const webApi: TimerApi = { async request<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, init); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Request failed"); return data as T; } };
type Entry = {
  id: string;
  description: string;
  start: string;
  end: string | null;
  project: Project;
};

export default function TimerView({ api = webApi }: { api?: TimerApi; desktop?: boolean }) {
  const { messages } = useI18n();
  const t = messages.app;
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [runningTimes, setRunningTimes] = useState({ start: "", end: "" });
  const [entryTimes, setEntryTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<Entry | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingRunning, setEditingRunning] = useState(false);

  const load = useCallback(async () => {
    const [p, e] = await Promise.all([
      api.request<{ projects: Project[] }>("/api/projects"),
      api.request<{ entries: Entry[] }>("/api/entries?mine=1"),
    ]);
    setProjects(p.projects ?? []);
    setEntries(e.entries ?? []);
    setProjectId((current) => current || p.projects?.[0]?.id || "");
  }, [api]);

  useEffect(() => {
    let active = true;
    const initialLoad = window.setTimeout(() => { if (active) void load().catch((cause) => setError(cause.message)); }, 0);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { active = false; window.clearTimeout(initialLoad); clearInterval(tick); };
  }, [load]);

  const running = entries.find((entry) => !entry.end) ?? null;
  const activeTimes = running
    ? { start: runningTimes.start || toLocalInput(running.start), end: runningTimes.end }
    : { start: "", end: "" };
  const todayMs = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return entries
      .filter((entry) => new Date(entry.start) >= start || !entry.end)
      .reduce((sum, entry) => sum + entryDuration(entry.start, entry.end), 0);
  }, [entries]);

  async function start(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api.request("/api/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId, description }) });
      setDescription("");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.deleteFailed); }
  }

  async function updateEntry(entry: Entry, start: string, end: string) {
    setError("");
    try {
      await api.request(`/api/entries/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start: new Date(start).toISOString(), end: end ? new Date(end).toISOString() : null }) });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t.deleteFailed); }
  }

  async function stop() {
    if (!running) return;
    await updateEntry(running, toLocalInput(running.start), toLocalInput(new Date()));
    setRunningTimes({ start: "", end: "" });
  }

  async function deleteEntry(entry: Entry) {
    setError("");
    try { await api.request(`/api/entries/${entry.id}`, { method: "DELETE" }); } catch (cause) { setError(cause instanceof Error ? cause.message : t.deleteFailed); return; }
    setEntryTimes((current) => {
      const next = { ...current };
      delete next[entry.id];
      return next;
    });
    setDeleteTarget(null);
    await load();
  }

  function timesFor(entry: Entry) {
    return entryTimes[entry.id] ?? {
      start: toLocalInput(entry.start),
      end: entry.end ? toLocalInput(entry.end) : "",
    };
  }

  return (
    <div>
      <PageHeader title={messages.timer} subtitle={`${t.todayRecorded} ${formatDuration(todayMs)}`} />
      <Card className="mb-6">
        {running ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{t.inProgress}</p>
              <p className="ora-time mt-1 text-5xl font-semibold tracking-tight">
                {formatDuration(now - new Date(activeTimes.start).getTime())}
              </p>
              <p className="mt-2 flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: running.project.color }} />
                {running.project.name}
                {running.description ? <span className="text-muted">· {running.description}</span> : null}
              </p>
            </div>
            <Button onClick={stop} variant="danger" className="h-14 px-6 text-base">
              <Pause size={18} /> {t.stop}
            </Button>
            <Button type="button" variant="ghost" className="ml-auto" aria-expanded={editingRunning} onClick={() => setEditingRunning((value) => !value)}><Pencil size={15} />{t.editEntry}</Button>
            {editingRunning ? <>
            <div className="flex w-full min-w-0 flex-col gap-4 md:flex-row md:justify-evenly">
              <Field className="w-full min-w-0 md:w-[calc(50%-0.5rem)]" label={t.startTime}>
                <Input className="block w-full min-w-0 max-w-full" type="datetime-local" required value={activeTimes.start} onChange={(event) => setRunningTimes({ ...activeTimes, start: event.target.value })} />
              </Field>
              <Field className="w-full min-w-0 md:w-[calc(50%-0.5rem)]" label={t.endTime}>
                <Input className="block w-full min-w-0 max-w-full" type="datetime-local" value={activeTimes.end} onChange={(event) => setRunningTimes({ ...activeTimes, end: event.target.value })} />
              </Field>
            </div>
            <div className="flex w-full items-center justify-end gap-3">
              <ErrorText>{error}</ErrorText>
              <Button type="button" className="h-[46px]" onClick={() => updateEntry(running, activeTimes.start, activeTimes.end).then(() => setRunningTimes({ start: "", end: "" }))} disabled={!activeTimes.start}>{t.save}</Button>
            </div>
            </> : null}
          </div>
        ) : (
          <form onSubmit={start} className="grid gap-4 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
            <Field label={t.doing}>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t.activityPlaceholder} />
            </Field>
            <Field label={t.project}>
              <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} required>
                {projects.length === 0 ? <option value="">{t.noProject}</option> : null}
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.team ? ` · ${project.team.name}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={!projectId} className="h-[46px]">
              <Play size={16} /> {t.start}
            </Button>
            <div className="md:col-span-3">
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        )}
      </Card>

      <h2 className="mb-3 text-sm font-medium text-muted">{t.recentEntries}</h2>
      {entries.filter((entry) => entry.id !== running?.id).length === 0 ? (
        <Empty>{t.noHoursYet}</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.filter((entry) => entry.id !== running?.id).slice(0, 12).map((entry) => (
            <div key={entry.id} className="grid min-w-0 gap-3 rounded-2xl border border-line bg-surface px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.description || t.noDescription}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: entry.project.color }} />
                  {entry.project.name}
                </p>
              </div>
              <p className="font-mono text-sm">{formatDuration(entryDuration(entry.start, entry.end))}</p>
              <Button type="button" variant="ghost" className="justify-self-end" aria-expanded={editingEntryId === entry.id} onClick={() => setEditingEntryId((id) => id === entry.id ? null : entry.id)}><Pencil size={15} />{t.editEntry}</Button>
              <Button type="button" variant="ghost" aria-label={t.deleteEntry} title={t.deleteEntry} className="justify-self-end px-3 text-danger" onClick={() => deleteEntry(entry)}><Trash2 size={16} /></Button>
              {editingEntryId === entry.id ? <>
              <div className="flex w-full min-w-0 flex-col gap-4 md:flex-row md:justify-evenly">
                <Field className="w-full min-w-0 md:w-[calc(50%-0.5rem)]" label={t.startTime}>
                  <Input className="block w-full min-w-0 max-w-full" type="datetime-local" required value={timesFor(entry).start} onChange={(event) => setEntryTimes({ ...entryTimes, [entry.id]: { ...timesFor(entry), start: event.target.value } })} />
                </Field>
                <Field className="w-full min-w-0 md:w-[calc(50%-0.5rem)]" label={t.endTime}>
                  <Input className="block w-full min-w-0 max-w-full" type="datetime-local" value={timesFor(entry).end} onChange={(event) => setEntryTimes({ ...entryTimes, [entry.id]: { ...timesFor(entry), end: event.target.value } })} />
                </Field>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Button type="button" className="h-[46px]" onClick={() => updateEntry(entry, timesFor(entry).start, timesFor(entry).end)} disabled={!timesFor(entry).start}>{t.save}</Button>
              </div>
              </> : null}
            </div>
          ))}
        </div>
      )}
      {deleteTarget ? <Modal title={t.deleteEntry} onClose={() => setDeleteTarget(null)}><p>{t.deleteConfirm}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t.cancel}</Button><Button variant="danger" onClick={() => void deleteEntry(deleteTarget)}>{t.deleteEntry}</Button></div></Modal> : null}
    </div>
  );
}

