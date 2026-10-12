"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Pause, Play } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, PageHeader, Select } from "@/components/ui";
import { entryDuration, formatDuration } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";

type Project = { id: string; name: string; color: string; team?: { name: string } | null };
type Entry = {
  id: string;
  description: string;
  start: string;
  end: string | null;
  project: Project;
};

export default function TimerPage() {
  const { messages } = useI18n();
  const t = messages.app;
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  async function load() {
    const [p, e] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/entries?mine=1").then((r) => r.json()),
    ]);
    setProjects(p.projects ?? []);
    setEntries(e.entries ?? []);
    setProjectId((current) => current || p.projects?.[0]?.id || "");
  }

  useEffect(() => {
    load();
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const running = entries.find((entry) => !entry.end) ?? null;
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
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, description }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setDescription("");
    load();
  }

  async function stop() {
    if (!running) return;
    await fetch(`/api/entries/${running.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end: new Date().toISOString() }),
    });
    load();
  }

  return (
    <div>
      <PageHeader title={messages.timer} subtitle={`${t.todayRecorded} ${formatDuration(todayMs)}`} />
      <Card className="mb-6">
        {running ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted">{t.inProgress}</p>
              <p className="mt-1 font-mono text-5xl font-semibold tracking-tight">
                {formatDuration(now - new Date(running.start).getTime())}
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
      {entries.length === 0 ? (
        <Empty>{t.noHoursYet}</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.slice(0, 12).map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{entry.description || t.noDescription}</p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: entry.project.color }} />
                  {entry.project.name}
                </p>
              </div>
              <p className="font-mono text-sm">{formatDuration(entryDuration(entry.start, entry.end))}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
