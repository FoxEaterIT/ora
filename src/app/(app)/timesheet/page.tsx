"use client";

import { FormEvent, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
import { entryDuration, formatDuration, hours, toLocalInput } from "@/lib/utils";
import { useI18n } from "@/i18n/provider";

type Project = { id: string; name: string; color: string };
type Entry = {
  id: string;
  description: string;
  start: string;
  end: string | null;
  project: Project & { team?: { name: string } | null };
};

const blank = { description: "", projectId: "", start: "", end: "" };

export default function TimesheetPage() {
  const { locale, messages } = useI18n();
  const t = messages.app;
  const [projects, setProjects] = useState<Project[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function deleteEntry(id: string) {
    setError("");
    const response = await fetch(`/api/entries/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? t.deleteFailed);
      return;
    }
    if (editing === id) {
      setEditing(null);
      setOpen(false);
    }
    setDeleteTarget(null);
    await load();
  }

  async function load() {
    const [p, e] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/entries?mine=1").then((r) => r.json()),
    ]);
    setProjects(p.projects ?? []);
    setEntries(e.entries ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function beginCreate() {
    const start = new Date();
    start.setMinutes(start.getMinutes() - 60);
    setEditing(null);
    setForm({
      description: "",
      projectId: projects[0]?.id ?? "",
      start: toLocalInput(start),
      end: toLocalInput(new Date()),
    });
    setOpen(true);
    setError("");
  }

  function beginEdit(entry: Entry) {
    setEditing(entry.id);
    setForm({
      description: entry.description,
      projectId: entry.project.id,
      start: toLocalInput(entry.start),
      end: entry.end ? toLocalInput(entry.end) : "",
    });
    setOpen(true);
    setError("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      projectId: form.projectId,
      description: form.description,
      start: new Date(form.start).toISOString(),
      end: form.end ? new Date(form.end).toISOString() : null,
    };
    const res = await fetch(editing ? `/api/entries/${editing}` : "/api/entries", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setOpen(false);
    load();
  }

  const total = entries.reduce((sum, entry) => sum + entryDuration(entry.start, entry.end), 0);

  return (
    <div>
      <PageHeader
        title={messages.myHours}
        subtitle={`${new Intl.NumberFormat(locale).format(hours(total))} ${t.hoursListed}`}
        action={
          <Button onClick={beginCreate}>
            <Plus size={16} /> {t.addManually}
          </Button>
        }
      />

      {open ? (
        <Card className="mb-5">
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
            <Field label={t.activity}>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label={t.project}>
              <Select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} required>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t.startTime}>
              <Input type="datetime-local" required value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </Field>
            <Field label={t.endTime}>
              <Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </Field>
            <div className="flex items-center gap-3 md:col-span-2">
              <Button type="submit">{t.save}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      ) : null}

      {entries.length === 0 ? (
        <Empty>{t.noHours}</Empty>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t.activity}</th>
                <th className="px-4 py-3 font-medium">{t.when}</th>
                <th className="px-4 py-3 font-medium">{t.duration}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium">{entry.description || t.noDescription}</p>
                    <p className="text-xs text-muted">{entry.project.name}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.start))}
                    {" → "}
                    {entry.end ? new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(entry.end)) : t.inProgress}
                  </td>
                  <td className="px-4 py-3 font-mono">{formatDuration(entryDuration(entry.start, entry.end))}</td>
                  <td className="px-4 py-3 text-right">
                    <button aria-label={t.editEntry} onClick={() => beginEdit(entry)} className="rounded-lg p-2 text-muted hover:bg-bg hover:text-ink">
                      <Pencil size={15} />
                    </button>
                    <button aria-label={t.deleteEntry} onClick={() => setDeleteTarget(entry.id)} className="rounded-lg p-2 text-danger hover:bg-bg">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {deleteTarget ? <Modal title={t.deleteEntry} onClose={() => setDeleteTarget(null)}><p>{t.deleteConfirm}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{t.cancel}</Button><Button variant="danger" onClick={() => void deleteEntry(deleteTarget)}>{t.deleteEntry}</Button></div></Modal> : null}
    </div>
  );
}
