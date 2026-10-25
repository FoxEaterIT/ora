"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button, Card, ErrorText, PageHeader } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

export default function BackupsPage() {
  const { messages } = useI18n();
  const t = messages.backupsPage;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function downloadBackup() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/backups", { cache: "no-store" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setError(data?.error || t.failed);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] || "ora-full-backup.zip";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(t.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t.title} subtitle={t.subtitle} />
      <Card className="max-w-3xl shadow-sm">
        <p className="text-sm leading-6 text-ink">{t.description}</p>
        <p className="mt-3 text-sm leading-6 text-muted">{t.restoreNote}</p>
        <ErrorText>{error}</ErrorText>
        <Button className="mt-5" onClick={() => void downloadBackup()} disabled={busy}>
          <Download size={16} /> {busy ? t.working : t.download}
        </Button>
      </Card>
    </>
  );
}
