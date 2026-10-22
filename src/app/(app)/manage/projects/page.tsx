"use client";

import { FormEvent, useEffect, useState } from "react";
import { Archive, Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { PROJECT_COLORS } from "@/lib/app-config";
import { useI18n } from "@/i18n/provider";
type SessionUser = { id: string; role: "OWNER" | "ADMIN" | "USER" };

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
  _count?: { entries: number };
};

const COLORS = PROJECT_COLORS;

export default function ProjectsPage() {
  const { messages } = useI18n();
  const t = messages.projectsPage;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], teamId: "", memberIds: [] as string[] });
  const manager = user ? user.role !== "USER" : false;

  async function load() {
    const me = await fetch("/api/me").then((r) => r.json());
    setUser(me.user);
    const [projectsResponse, teamsResponse, usersResponse] = await Promise.all([
      fetch("/api/projects"),
      me.user?.role !== "USER" ? fetch("/api/teams") : Promise.resolve(null),
      me.user?.role !== "USER" ? fetch("/api/users") : Promise.resolve(null),
    ]);
    const p = await projectsResponse.json();
    setProjects(p.projects ?? []);
    if (teamsResponse && usersResponse) {
      const [teamsData, usersData] = await Promise.all([teamsResponse.json(), usersResponse.json()]);
      setTeams(teamsData.teams ?? []);
      setUsers(usersData.users ?? []);
    }
  }

  useEffect(() => { load(); }, []);

  function beginCreate() {
    setEditing(null);
    setForm({ name: "", description: "", color: COLORS[0], teamId: "", memberIds: [] });
    setOpen(true);
    setError("");
  }

  function beginEdit(project: Project) {
    setEditing(project.id);
    setForm({ name: project.name, description: project.description, color: project.color, teamId: project.teamId ?? "", memberIds: project.members.map((m) => m.user.id) });
    setOpen(true);
    setError("");
  }

  function toggleMember(id: string) {
    setForm((current) => ({ ...current, memberIds: current.memberIds.includes(id) ? current.memberIds.filter((x) => x !== id) : [...current.memberIds, id] }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = manager ? { ...form, teamId: form.teamId || null } : { name: form.name, description: form.description, color: form.color, memberIds: form.memberIds };
    const res = await fetch(editing ? `/api/projects/${editing}` : "/api/projects", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setOpen(false);
    await load();
  }

  async function toggleArchive(project: Project) {
    await fetch(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !project.archived }) });
    await load();
  }

  async function deleteProject(project: Project) {
    setError("");
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { setError(data.error); return; }
    setDeleteTarget(null);
    await load();
  }

  return (
    <div>
      <PageHeader title={t.title} subtitle={t.subtitle} action={<Button onClick={beginCreate}><Plus size={16} /> {t.newProject}</Button>} />
      {error ? <ErrorText>{error}</ErrorText> : null}
      {open ? <Card className="mb-5"><form onSubmit={save} className="grid gap-4">
        <div className={`grid gap-4 ${manager ? "md:grid-cols-2" : ""}`}>
          <Field label={t.name}><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {manager ? <Field label={t.team}><Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}><option value="">{t.noTeam}</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></Field> : null}
        </div>
        <Field label={t.description}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div><p className="mb-2 text-sm font-medium text-muted">{t.color}</p><div className="flex gap-2">{COLORS.map((color) => <button type="button" aria-label={color} key={color} onClick={() => setForm({ ...form, color })} className="h-8 w-8 rounded-full ring-offset-2" style={{ background: color, outline: form.color === color ? `2px solid ${color}` : undefined }} />)}</div></div>
        {manager ? <div><p className="mb-2 text-sm font-medium text-muted">{t.directMembers}</p><div className="flex flex-wrap gap-2">{users.map((person) => { const on = form.memberIds.includes(person.id); return <button type="button" key={person.id} onClick={() => toggleMember(person.id)} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{person.name}</button>; })}</div></div> : user ? <div><p className="mb-2 text-sm font-medium text-muted">{t.directMembers}</p><div className="flex flex-wrap gap-2">{form.memberIds.map((memberId) => <span key={memberId} className="rounded-full border border-line px-3 py-1 text-sm">{projects.find((project) => project.members.some((member) => member.user.id === memberId))?.members.find((member) => member.user.id === memberId)?.user.name ?? (memberId === user.id ? t.assignSelf : memberId)}</span>)}<button type="button" onClick={() => toggleMember(user.id)} className={`rounded-full border px-3 py-1 text-sm ${form.memberIds.includes(user.id) ? "border-brand bg-brand text-white" : "border-line"}`}>{t.assignSelf}</button></div></div> : null}
        <div className="flex items-center gap-3"><Button type="submit">{t.save}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
      </form></Card> : null}
      {projects.length === 0 ? <Empty>{t.none}</Empty> : <div className="grid gap-3 md:grid-cols-2">{projects.map((project) => <Card key={project.id} className={project.archived ? "opacity-60" : ""}><div className="flex items-start justify-between gap-3"><button onClick={() => beginEdit(project)} className="min-w-0 text-left"><p className="flex items-center gap-2 font-medium"><span className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</p><p className="mt-1 text-sm text-muted">{project.description || t.noDescription}</p><p className="mt-2 text-xs text-muted">{project.team?.name ?? t.noTeam} · {project.members.length} {t.members}{project.archived ? ` · ${t.archived}` : ""}</p></button>{manager ? <div className="flex"><button onClick={() => toggleArchive(project)} className="rounded-lg p-2 text-muted hover:bg-bg" title={project.archived ? t.unarchive : t.archive}><Archive size={16} /></button><button onClick={() => setDeleteTarget(project)} className="rounded-lg p-2 text-danger hover:bg-bg" title={t.delete}><Trash2 size={16} /></button></div> : null}</div></Card>)}</div>}
      {deleteTarget ? <Modal title={t.delete} onClose={() => setDeleteTarget(null)}><p>{t.deleteConfirm}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{messages.app.cancel}</Button><Button variant="danger" onClick={() => void deleteProject(deleteTarget)}>{t.delete}</Button></div></Modal> : null}
    </div>
  );
}
