"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button, Card, Checkbox, ErrorText, PageHeader } from "@/components/ui";
import { Modal } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

export default function UninstallPage() {
  const { messages } = useI18n();
  const t = messages.uninstallPage;
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [keepData, setKeepData] = useState(true);
  const [createInventory, setCreateInventory] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [backupReady, setBackupReady] = useState(false);

  async function refresh() {
    try {
      const response = await fetch("/api/deletion", { cache: "no-store" });
      if (!response.ok) return;
      const data = await response.json();
      setAvailable(data.available === true);
      if (data.status?.phase === "succeeded") setBackupReady(false);
      if (data.status?.message) setStatus(data.status.message);
      setBusy(["preparing", "stopping", "removing"].includes(data.status?.phase));
      if (data.status?.phase === "succeeded") setAvailable(false);
    } catch { setAvailable(false); }
  }
  useEffect(() => { void refresh(); const interval = window.setInterval(() => void refresh(), 3000); return () => window.clearInterval(interval); }, []);

  async function downloadBackup() {
    setError("");
    try {
      const response = await fetch("/api/backups", { cache: "no-store" });
      if (!response.ok) { const data = await response.json().catch(() => null); setError(data?.error || t.failed); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "ora-full-backup.zip";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBackupReady(true);
    } catch { setError(t.failed); }
  }

  async function start() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, createExcel: createInventory, keepData }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) { setError(data?.error || t.failed); setBusy(false); return; }
      setConfirm(false);
      setStatus(t.accepted);
    } catch { setError(t.failed); setBusy(false); }
  }

  return <>
    <PageHeader title={t.title} subtitle={t.subtitle} />
    <Card className="max-w-3xl border-danger/30 shadow-sm">
      <div className="flex items-start gap-3"><AlertTriangle className="mt-1 shrink-0 text-danger" size={20} /><p className="text-sm leading-6">{t.warning}</p></div>
      <label className="mt-5 flex items-start gap-3 text-sm"><Checkbox checked={keepData} onChange={(event) => setKeepData(event.target.checked)} /><span>{t.keepData}</span></label>
      <label className="mt-3 flex items-start gap-3 text-sm"><Checkbox checked={createInventory} onChange={(event) => setCreateInventory(event.target.checked)} /><span>{t.createInventory}</span></label>
      <p className="mt-3 text-sm text-muted">{t.exportRequired}</p>
      <Button className="mt-4" variant="ghost" disabled={!available || busy} onClick={() => void downloadBackup()}>{t.downloadBackup}</Button>
      {backupReady && <p className="mt-2 text-sm text-good">{t.backupDownloaded}</p>}
      <p className="mt-3 text-sm text-muted">{status}</p>
      <ErrorText>{error}</ErrorText>
      <Button className="mt-5" variant="danger" disabled={!available || busy || !backupReady} onClick={() => { setTyped(""); setConfirm(true); }}><Trash2 size={16} />{busy ? t.working : t.begin}</Button>
      {!available && <p className="mt-3 text-sm text-muted">{t.serviceUnavailable}</p>}
    </Card>
    {confirm && <Modal title={t.confirmTitle} onClose={() => setConfirm(false)}>
      <p className="text-sm leading-6">{t.confirmBody}</p>
      <label className="mt-4 block text-sm font-medium">{t.typeYes}<input className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" /></label>
      <p className="mt-3 text-sm text-muted">{t.keepDataChoice}</p>
      <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>{messages.app.cancel}</Button><Button variant="danger" disabled={typed !== "YES"} onClick={() => void start()}>{t.confirmAction}</Button></div>
    </Modal>}
  </>;
}
