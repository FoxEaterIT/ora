"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Archive, Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { PROJECT_COLORS } from "@/lib/app-config";
import { useI18n } from "@/i18n/provider";

type SessionUser = { id: string; role: "OWNER" | "ADMIN" | "USER" };
type Person = { id: string; name: string; email: string };
type Team = { id: string; name: string };
type Project = { id: string; name: string; description: string; color: string; archived: boolean; teamId: string | null; team: Team | null; members: { user: Person }[]; _count?: { entries: number } };
type DesktopProject = { id: string; name: string; description: string; color: string; archived: boolean; team: Team | null; members: { user: Person }[]; hasEntries: boolean };
export interface ProjectApi { request<T>(path: string, init?: RequestInit): Promise<T> }
const COLORS = PROJECT_COLORS;

export default function ProjectsView({ api, desktop = false }: { api: ProjectApi; desktop?: boolean }) {
  const { messages } = useI18n();
  const t = messages.projectsPage;
  const [user, setUser] = useState<SessionUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], teamId: "", memberIds: [] as string[] });
  const manager = user ? user.role !== "USER" : false;

  const load = useCallback(async () => {
    const me = await api.request<{ user: SessionUser | null }>("/api/me");
    const currentUser = me.user ? { id: me.user.id, role: me.user.role } : null;
    setUser(currentUser);
    const [projectData, teamData, userData] = await Promise.all([
      api.request<{ projects: Array<Project | DesktopProject> }>("/api/projects"),
      !desktop && me.user?.role !== "USER" ? api.request<{ teams: Team[] }>("/api/teams") : Promise.resolve(null),
      !desktop && me.user?.role !== "USER" ? api.request<{ users: Person[] }>("/api/users") : Promise.resolve(null),
    ]);
    setProjects((projectData.projects ?? []).map(project => ({
      ...project,
      teamId: 'teamId' in project ? project.teamId : project.team?.id ?? null,
      _count: 'hasEntries' in project ? { entries: project.hasEntries ? 1 : 0 } : project._count,
    })));
    if (teamData && userData) { setTeams(teamData.teams ?? []); setUsers(userData.users ?? []); }
  }, [api, desktop]);
  useEffect(() => { void load().catch(e => setError(e.message)); }, [load]);
  function beginCreate() { setEditing(null); setForm({ name: "", description: "", color: COLORS[0], teamId: "", memberIds: [] }); setOpen(true); setError(""); }
  function beginEdit(project: Project) { setEditing(project.id); setForm({ name: project.name, description: project.description, color: project.color, teamId: project.teamId ?? "", memberIds: project.members.map(m => m.user.id) }); setOpen(true); setError(""); }
  function toggleMember(id: string) { setForm(current => ({ ...current, memberIds: current.memberIds.includes(id) ? current.memberIds.filter(x => x !== id) : [...current.memberIds, id] })); }
  async function save(event: FormEvent) {
    event.preventDefault(); setError("");
    const payload = manager && !desktop ? { ...form, teamId: form.teamId || null } : { name: form.name, description: form.description, color: form.color, memberIds: form.memberIds };
    await api.request(editing ? `/api/projects/${editing}` : "/api/projects", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setOpen(false); await load();
  }
  async function toggleArchive(project: Project) { await api.request(`/api/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !project.archived }) }); await load(); }
  async function deleteProject(project: Project) { setError(""); await api.request(`/api/projects/${project.id}`, { method: "DELETE" }); setDeleteTarget(null); await load(); }

  return <div>
    <PageHeader title={t.title} subtitle={t.subtitle} action={<Button onClick={beginCreate}><Plus size={16} /> {t.newProject}</Button>} />
    {error ? <ErrorText>{error}</ErrorText> : null}
    {open ? <Card className="mb-5"><form onSubmit={e => void save(e).catch(err => setError(err.message))} className="grid gap-4">
      <div className={`grid gap-4 ${manager ? "md:grid-cols-2" : ""}`}>
        <Field label={t.name}><Input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        {manager && !desktop ? <Field label={t.team}><Select value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}><option value="">{t.noTeam}</option>{teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}</Select></Field> : null}
      </div>
      <Field label={t.description}><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
      <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium text-muted">{t.color}</legend><div className="flex gap-2">{COLORS.map(color => <button type="button" aria-label={`${t.color} ${color}`} aria-pressed={form.color === color} key={color} onClick={() => setForm({ ...form, color })} className="h-8 w-8 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 focus-visible:ring-offset-2" style={{ background: color, outline: form.color === color ? `2px solid ${color}` : undefined }} />)}</div></fieldset>
      {manager && !desktop ? <fieldset className="min-w-0"><legend className="mb-2 text-sm font-medium text-muted">{t.directMembers}</legend><div className="flex flex-wrap gap-2">{users.map(person => { const on = form.memberIds.includes(person.id); return <button type="button" aria-pressed={on} key={person.id} onClick={() => toggleMember(person.id)} className={`rounded-full border px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 ${on ? "border-brand bg-brand text-white" : "border-line"}`}>{person.name}</button>; })}</div></fieldset> : user ? <div><p className="mb-2 text-sm font-medium text-muted">{t.directMembers}</p><div className="flex flex-wrap gap-2">{form.memberIds.map(memberId => <span key={memberId} className="rounded-full border border-line px-3 py-1 text-sm">{projects.find(p => p.members.some(m => m.user.id === memberId))?.members.find(m => m.user.id === memberId)?.user.name ?? (memberId === user.id ? t.assignSelf : memberId)}</span>)}<button type="button" onClick={() => toggleMember(user.id)} className={`rounded-full border px-3 py-1 text-sm ${form.memberIds.includes(user.id) ? "border-brand bg-brand text-white" : "border-line"}`}>{t.assignSelf}</button></div></div> : null}
      <div className="flex items-center gap-3"><Button type="submit">{t.save}</Button><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button></div>
    </form></Card> : null}
    {projects.length === 0 ? <Empty>{t.none}</Empty> : <div className="grid gap-4 md:grid-cols-2">{projects.map(project => <Card key={project.id} className={`transition-shadow hover:shadow-md ${project.archived ? "opacity-60" : ""}`}><div className="flex items-start justify-between gap-3"><button type="button" onClick={() => beginEdit(project)} className="min-w-0 text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"><p className="flex items-center gap-2 font-medium"><span className="h-3 w-3 rounded-full" style={{ background: project.color }} />{project.name}</p><p className="mt-1 text-sm text-muted">{project.description || t.noDescription}</p><p className="mt-2 text-xs text-muted">{project.team?.name ?? t.noTeam} · {project.members.length} {t.members}{project.archived ? ` · ${t.archived}` : ""}</p></button>{manager && !desktop ? <div className="flex"><button type="button" onClick={() => void toggleArchive(project).catch(e => setError(e.message))} className="rounded-lg p-2 text-muted hover:bg-bg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25" aria-label={`${project.archived ? t.unarchive : t.archive} ${project.name}`}><Archive size={16} aria-hidden="true" /></button><button type="button" onClick={() => setDeleteTarget(project)} className="rounded-lg p-2 text-danger hover:bg-bg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25" aria-label={`${t.delete} ${project.name}`}><Trash2 size={16} aria-hidden="true" /></button></div> : null}</div></Card>)}</div>}
    {deleteTarget ? <Modal title={t.delete} onClose={() => setDeleteTarget(null)}><p>{t.deleteConfirm}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)}>{messages.app.cancel}</Button><Button variant="danger" onClick={() => void deleteProject(deleteTarget).catch(e => setError(e.message))}>{t.delete}</Button></div></Modal> : null}
  </div>;
}
