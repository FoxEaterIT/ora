"use client";

import { useEffect, useState } from "react";
import { DownloadCloud } from "lucide-react";
import { Button, Card, Modal, PageHeader } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

export default function DesktopReleasePage() {
  const { messages } = useI18n();
  const [release, setRelease] = useState<{ version: string; releaseUrl: string; body: string; assets: { name: string; url: string }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/desktop-release", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data?.version && Array.isArray(data.assets)) setRelease(data); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={messages.newVersion} subtitle={messages.desktopReleasePageSubtitle} />
      {loading ? <Card><p className="text-sm text-muted">{messages.auth.wait}</p></Card> : release ? (
        <Card className="space-y-5">
          <div className="flex items-start gap-4">
            <span className="ora-icon-disc"><DownloadCloud size={19} aria-hidden="true" /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">{messages.desktopReleaseAvailable.replace("{version}", release.version)}</h2>
              <p className="mt-1 text-sm text-muted">{messages.desktopReleasePageSubtitle}</p>
            </div>
          </div>
          <Button onClick={() => setDetailsOpen(true)}>{messages.viewRelease}</Button>
          <ul className="grid gap-3 border-t border-line pt-4">
            {release.assets.map((asset) => (
              <li key={asset.name} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface/70 p-3">
                <span className="break-all text-sm font-medium text-ink">{asset.name}</span>
                <a href={asset.url} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{messages.downloadDesktop}</a>
              </li>
            ))}
          </ul>
        </Card>
      ) : <Card><p className="text-sm text-muted">{messages.noDesktopRelease}</p></Card>}
      {detailsOpen && release && <Modal title={messages.releaseDetails} onClose={() => setDetailsOpen(false)}>
        <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm">{release.body || messages.desktopReleaseAvailable.replace("{version}", release.version)}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setDetailsOpen(false)}>{messages.releaseDetailsClose}</Button>
          <a href={release.releaseUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface-raised px-4 py-2 text-sm font-semibold text-ink hover:border-brand/50">GitHub</a>
        </div>
      </Modal>}
    </div>
  );
}
