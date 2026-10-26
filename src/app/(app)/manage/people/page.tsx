"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, Save, Trash2 } from "lucide-react";
import { Button, Card, Empty, ErrorText, Field, Input, Modal, PageHeader, Select } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

type Team = { id: string; name: string };
type Person = {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: "OWNER" | "ADMIN" | "USER";
  passwordSet: boolean;
  deactivatedAt: string | null;
  memberships?: { team: Team }[];
};

const emptyForm = { firstName: "", lastName: "", email: "", role: "USER", teamId: "" };

/** Owner/admin user directory and account provisioning form. */
export default function PeoplePage() {
  const { messages } = useI18n();
  const t = messages.peoplePage;
  const [people, setPeople] = useState<Person[]>([]);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [me, setMe] = useState<Person | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [emailDrafts, setEmailDrafts] = useState<Record<string, string>>({});
  const [confirmation, setConfirmation] = useState<{ title: string; message: string; person: Person; action: "reset" | "deactivate" } | null>(null);
  const [dialogError, setDialogError] = useState("");

  const load = useCallback(async () => {
    const [usersResponse, sessionResponse, teamsResponse] = await Promise.all([
      fetch(showDeactivated ? "/api/users?includeDeactivated=1" : "/api/users"),
      fetch("/api/me"),
      fetch("/api/teams"),
    ]);
    const [usersData, sessionData, teamsData] = await Promise.all([
      usersResponse.json(), sessionResponse.json(), teamsResponse.json(),
    ]);
    setPeople(usersData.users ?? []);
    setEmailDrafts(Object.fromEntries((usersData.users ?? []).map((person: Person) => [person.id, person.email])));
    setMe(sessionData.user);
    setTeams(teamsData.teams ?? []);
  }, [showDeactivated]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => { if (active) void load(); }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [load]);

  const owner = me?.role === "OWNER";

  async function create(event: FormEvent) {
    event.preventDefault();
    setError("");

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error ?? t.createFailed);
      return;
    }

    setOpen(false);
    setForm(emptyForm);
    await load();
  }

  async function updatePerson(person: Person, changes: { role?: string; email?: string; resetPassword?: true }) {
    const response = await fetch(`/api/users/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
    const data = await response.json();
    if (!response.ok) {
      setDialogError(data.error);
      return;
    }
    await load();
  }

  async function setRole(person: Person, role: string) {
    await updatePerson(person, { role });
  }

  async function saveEmail(person: Person) {
    const email = emailDrafts[person.id]?.trim();
    if (!email || email.toLowerCase() === person.email.toLowerCase()) return;
    await updatePerson(person, { email });
  }

  function resetPassword(person: Person) {
    setDialogError("");
    setConfirmation({ title: t.forceReset, message: `${t.resetConfirm} ${person.name}${t.resetSuffix}`, person, action: "reset" });
  }

  async function remove(person: Person) {
    const response = await fetch(`/api/users/${person.id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) {
      setDialogError(data.error);
      return;
    }
    setConfirmation(null);
    await load();
  }

  async function reactivate(person: Person) {
    const response = await fetch(`/api/users/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reactivate: true }),
    });
    const data = await response.json();
    if (!response.ok) {
      setDialogError(data.error);
      return;
    }
    setConfirmation(null);
    await load();
  }

  return (
    <div>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        action={<Button onClick={() => setOpen((value) => !value)}><Plus size={16} /> {t.newPerson}</Button>}
      />
      {dialogError && !confirmation ? <Modal title={t.title} onClose={() => setDialogError("")}><p>{dialogError}</p><div className="mt-5 flex justify-end"><Button onClick={() => setDialogError("")}>{messages.app.cancel}</Button></div></Modal> : null}
      <div className="mb-4 flex justify-end"><Button variant="ghost" onClick={() => setShowDeactivated((value) => !value)}>{showDeactivated ? t.hideDeactivated : t.showDeactivated}</Button></div>

      {open ? (
        <Card className="mb-5">
          <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
            <Field label={t.firstName}>
              <Input required autoComplete="given-name" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            </Field>
            <Field label={t.lastName}>
              <Input required autoComplete="family-name" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            </Field>
            <Field label={t.email}>
              <Input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label={t.role}>
              <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} disabled={!owner}>
                <option value="USER">{messages.role.USER}</option>
                {owner ? <option value="ADMIN">{messages.role.ADMIN}</option> : null}
              </Select>
            </Field>
            <Field label={t.team}>
              <Select value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>
                <option value="">{t.noTeam}</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </Select>
            </Field>
            <p className="self-end text-xs text-muted">{t.passwordFirstLogin}</p>
            <div className="flex items-center gap-3 md:col-span-2">
              <Button type="submit">{t.createAccount}</Button>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t.cancel}</Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      ) : null}

      {confirmation ? <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p>{confirmation.message}</p><ErrorText>{dialogError}</ErrorText><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmation(null)}>{messages.app.cancel}</Button><Button variant="danger" onClick={() => { const current = confirmation; setConfirmation(null); if (current.action === "reset") void updatePerson(current.person, { resetPassword: true }); else void remove(current.person); }}>{confirmation.action === "reset" ? t.forceReset : t.deletePerson}</Button></div></Modal> : null}
      {people.length === 0 ? <Empty>{t.none}</Empty> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">{t.name}</th>
                <th className="px-4 py-3 font-medium">{t.email}</th>
                <th className="px-4 py-3 font-medium">{t.team}</th>
                <th className="px-4 py-3 font-medium">{t.role}</th>
                <th className="px-4 py-3 font-medium">{t.access}</th>
                <th className="px-4 py-3 font-medium">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 font-medium">{person.name}{person.deactivatedAt ? <span className="ml-2 rounded-full bg-bg px-2 py-1 text-xs text-muted">{t.inactive}</span> : null}</td>
                  <td className="px-4 py-3 text-muted">
                    {owner && person.role !== "OWNER" && !person.deactivatedAt ? (
                      <div className="flex min-w-56 items-center gap-2">
                        <Input type="email" aria-label={`${t.emailOf} ${person.name}`} value={emailDrafts[person.id] ?? person.email} onChange={(event) => setEmailDrafts({ ...emailDrafts, [person.id]: event.target.value })} />
                        {emailDrafts[person.id] !== person.email && <Button variant="ghost" onClick={() => void saveEmail(person)} aria-label={`${t.saveEmail} ${person.name}`}><Save size={15} /></Button>}
                      </div>
                    ) : person.email}
                  </td>
                  <td className="px-4 py-3 text-muted">{person.memberships?.map((membership) => membership.team.name).join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    {owner && person.role !== "OWNER" && !person.deactivatedAt ? (
                      <Select value={person.role} onChange={(event) => setRole(person, event.target.value)} className="w-32">
                        <option value="USER">{messages.role.USER}</option><option value="ADMIN">{messages.role.ADMIN}</option>
                      </Select>
                    ) : <span className="rounded-full bg-bg px-2 py-1 text-xs">{messages.role[person.role]}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{person.passwordSet ? t.activated : t.toActivate}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {owner && person.role !== "OWNER" && !person.deactivatedAt && (
                        <button onClick={() => void resetPassword(person)} className="rounded-lg p-2 text-muted hover:text-ink" aria-label={`${t.forceReset} ${person.name}`} title={t.forceResetTitle}>
                          <KeyRound size={15} />
                        </button>
                      )}
                      {owner && person.role !== "OWNER" && person.deactivatedAt ? (
                        <Button variant="ghost" onClick={() => void reactivate(person)}>{t.reactivate}</Button>
                      ) : person.role !== "OWNER" && person.id !== me?.id && !person.deactivatedAt ? (
                        <button onClick={() => remove(person)} className="rounded-lg p-2 text-muted hover:text-danger" aria-label={`${t.deletePerson} ${person.name}`}>
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
