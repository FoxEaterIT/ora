"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Input, PageHeader } from "@/components/ui";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { useI18n } from "@/i18n/provider";

export default function AccountPage() {
  const { messages } = useI18n();
  const t = messages.app;
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/api/me").then((response) => response.json()).then((data) => {
      setEmail(data.user?.email ?? "");
      setRole(data.user?.role ?? null);
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword && newPassword !== confirmPassword) {
      setError(t.passwordMismatch);
      return;
    }
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(role === "OWNER" ? { email } : {}), currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? t.accountUpdateFailed);
      return;
    }
    setEmail(data.user.email);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(t.credentialsUpdated);
    router.refresh();
  }

  return (
    <div>
      <PageHeader title={t.accountTitle} subtitle={role === "OWNER" ? t.updateEmailPassword : t.updatePassword} />
      <Card className="max-w-xl shadow-sm">
        <form onSubmit={save} className="flex flex-col gap-4">
          {role === "OWNER" ? (
            <Field label={t.email}>
              <Input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
          ) : (
            <p className="text-sm text-muted">{t.accountEmail}: {email}. {t.ownerCanChange}</p>
          )}
          <Field label={t.currentPassword}>
            <Input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          </Field>
          <Field label={t.newPasswordOptional}>
            <Input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
          </Field>
          <Field label={t.confirmNewPassword}>
            <Input type="password" autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
          </Field>
          <p className="text-xs text-muted">{t.passwordOnlyHint}</p>
          <div className="flex items-center gap-3">
            <Button type="submit">{t.saveChanges}</Button>
            {message && <span className="text-sm text-good">{message}</span>}
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      </Card>
    </div>
  );
}
