"use client";

import { FormEvent, useEffect, useState } from "react";
import { Archive, Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { PROJECT_COLORS } from "@/lib/app-config";
import { useI18n } from "@/i18n/provider";

type User = { id: string; name: string; email: string };
type Team = { id: string; name: string };
type Project = {
  id: string;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  teamId: string | null;
  team: Team | null;
  members: { user: User }[];
};

const COLORS = PROJECT_COLORS;

export default function ProjectsPage() {
  const { messages } = useI18n();
  const t = messages.projectsPage;
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], teamId: "", memberIds: [] as string[] });

  async function load() {
    const [p, t, u] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]);
    setProjects(p.projects ?? []);
    setTeams(t.teams ?? []);
    setUsers(u.users ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function beginCreate() {
    setEditing(null);
    setForm({ name: "", description: "", color: COLORS[0], teamId: "", memberIds: [] });
    setOpen(true);
    setError("");
  }

  function beginEdit(project: Project) {
    setEditing(project.id);
    setForm({
      name: project.name,
      description: project.description,
      color: project.color,
      teamId: project.teamId ?? "",
      memberIds: project.members.map((m) => m.user.id),
    });
    setOpen(true);
    setError("");
  }

  function toggleMember(id: string) {
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(id) ? current.memberIds.filter((x) => x !== id) : [...current.memberIds, id],
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const payload = { ...form, teamId: form.teamId || null };
    const res = await fetch(editing ? `/api/projects/${editing}` : "/api/projects", {
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

  async function toggleArchive(project: Project) {
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !project.archived }),
    });
    load();
  }

  async function remove(id: string) {
    if (!confirm(t.deleteConfirm)) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        action={
          <Button onClick={beginCreate}>
            <Plus size={16} /> {t.newProject}
          </Button>
        }
      />

      {open ? (
        <Card className="mb-5">
          <form onSubmit={save} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t.name}>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label={t.team}>
                <Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
                  <option value="">{t.noTeam}</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t.description}>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-muted">{t.color}</p>
              <div className="flex gap-2">
                {COLORS.map((color) => (
                  <button
                    type="button"
                    key={color}
                    onClick={() => setForm({ ...form, color })}
                    className="h-8 w-8 rounded-full ring-offset-2"
                    style={{ background: color, outline: form.color === color ? `2px solid ${color}` : undefined }}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-muted">{t.directMembers}</p>
              <div className="flex flex-wrap gap-2">
                {users.map((user) => {
                  const on = form.memberIds.includes(user.id);
                  return (
                    <button
                      type="button"
                      key={user.id}
                      onClick={() => toggleMember(user.id)}
                      className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand text-white" : "border-line"}`}
                    >
                      {user.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit">{t.save}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t.cancel}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      ) : null}

      {projects.length === 0 ? (
        <Empty>{t.none}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {projects.map((project) => (
            <Card key={project.id} className={project.archived ? "opacity-60" : ""}>
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => beginEdit(project)} className="min-w-0 text-left">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 rounded-full" style={{ background: project.color }} />
                    {project.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">{project.description || t.noDescription}</p>
                  <p className="mt-2 text-xs text-muted">
                    {project.team?.name ?? t.noTeam} · {project.members.length} {t.members}
                    {project.archived ? ` · ${t.archived}` : ""}
                  </p>
                </button>
                <div className="flex">
                  <button onClick={() => toggleArchive(project)} className="rounded-lg p-2 text-muted hover:bg-bg" title={project.archived ? t.unarchive : t.archive}>
                    <Archive size={16} />
                  </button>
                  <button onClick={() => remove(project.id)} className="rounded-lg p-2 text-muted hover:text-danger">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
