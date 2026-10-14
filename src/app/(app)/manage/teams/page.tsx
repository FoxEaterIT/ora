"use client";

import { FormEvent, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { TEAM_COLORS } from "@/lib/app-config";
import { useI18n } from "@/i18n/provider";

type User = { id: string; name: string; email: string; role: string };
type Team = {
  id: string;
  name: string;
  description: string;
  color: string;
  members: { user: User }[];
  _count?: { projects: number };
};

const COLORS = TEAM_COLORS;

export default function TeamsPage() {
  const { messages } = useI18n();
  const t = messages.teamsPage;
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0], memberIds: [] as string[] });

  async function load() {
    const [t, u] = await Promise.all([fetch("/api/teams").then((r) => r.json()), fetch("/api/users").then((r) => r.json())]);
    setTeams(t.teams ?? []);
    setUsers(u.users ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  function toggle(id: string) {
    setForm((current) => ({
      ...current,
      memberIds: current.memberIds.includes(id) ? current.memberIds.filter((x) => x !== id) : [...current.memberIds, id],
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const res = await fetch(editing ? `/api/teams/${editing}` : "/api/teams", {
      method: editing ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setOpen(false);
    load();
  }

  async function remove(id: string) {
    if (!confirm(t.deleteConfirm)) return;
    const response = await fetch(`/api/teams/${id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error);
      return;
    }
    load();
  }

  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        action={
          <Button
            onClick={() => {
              setEditing(null);
              setForm({ name: "", description: "", color: COLORS[0], memberIds: [] });
              setOpen(true);
              setError("");
            }}
          >
            <Plus size={16} /> {t.newTeam}
          </Button>
        }
      />

      {open ? (
        <Card className="mb-5">
          <form onSubmit={save} className="grid gap-4">
            <Field label={t.name}>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t.description}>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div className="flex gap-2">
              {COLORS.map((color) => (
                <button
                  type="button"
                  key={color}
                  onClick={() => setForm({ ...form, color })}
                  className="h-8 w-8 rounded-full"
                  style={{ background: color, outline: form.color === color ? `2px solid ${color}` : undefined }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {users.map((user) => {
                const on = form.memberIds.includes(user.id);
                return (
                  <button
                    type="button"
                    key={user.id}
                    onClick={() => toggle(user.id)}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-brand bg-brand text-white" : "border-line"}`}
                  >
                    {user.name}
                  </button>
                );
              })}
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

      {teams.length === 0 ? (
        <Empty>{t.none}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map((team) => (
            <Card key={team.id}>
              <div className="flex items-start justify-between">
                <button
                  className="text-left"
                  onClick={() => {
                    setEditing(team.id);
                    setForm({
                      name: team.name,
                      description: team.description,
                      color: team.color,
                      memberIds: team.members.map((m) => m.user.id),
                    });
                    setOpen(true);
                  }}
                >
                  <p className="flex items-center gap-2 font-medium">
                    <span className="h-3 w-3 rounded-full" style={{ background: team.color }} />
                    {team.name}
                  </p>
                  <p className="mt-1 text-sm text-muted">{team.description || t.noDescription}</p>
                  <p className="mt-3 text-xs text-muted">
                    {team.members.map((m) => m.user.name).join(", ") || t.noMembers} · {team._count?.projects ?? 0} {t.projects}
                  </p>
                </button>
                <button onClick={() => remove(team.id)} className="rounded-lg p-2 text-muted hover:text-danger">
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
