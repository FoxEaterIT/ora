"use client";

import { useEffect, useState } from "react";
import { DownloadCloud, Info } from "lucide-react";
import { Button, Card, Modal, PageHeader } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

export default function DesktopReleasePage() {
  const { messages } = useI18n();
  const [release, setRelease] = useState<{ version: string; releaseUrl: string; body: string; assets: { name: string; url: string; digest?: string | null }[] } | null>(null);
  const [githubUnavailable, setGithubUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [digestAsset, setDigestAsset] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/desktop-release", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!active) return;
        if (data?.githubUnavailable === true) setGithubUnavailable(true);
        else if (data?.version && Array.isArray(data.assets)) setRelease(data);
      })
      .catch(() => { if (active) setGithubUnavailable(true); })
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
              <li key={asset.name} className="rounded-2xl bg-surface/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="break-all text-sm font-medium text-ink">{asset.name}</span>
                  <div className="flex items-center gap-3">
                    {asset.digest && <button type="button" aria-expanded={digestAsset === asset.name} aria-label={digestAsset === asset.name ? messages.hideDesktopDigest : messages.showDesktopDigest} title={messages.showDesktopDigest} onClick={() => { setDigestAsset((current) => current === asset.name ? null : asset.name); setCopied(false); }} className="ora-icon-disc text-muted hover:text-ink"><Info size={16} aria-hidden="true" /></button>}
                    <a href={asset.url} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{messages.downloadDesktop}</a>
                  </div>
                </div>
                {digestAsset === asset.name && asset.digest && <div className="mt-3 border-t border-line pt-3">
                  <p className="text-xs text-muted">{messages.desktopDigestNote}</p>
                  <p className="mt-2 break-all font-mono text-xs text-ink">{asset.digest}</p>
                  <Button className="mt-3" variant="ghost" onClick={() => { void navigator.clipboard.writeText(asset.digest || "").then(() => setCopied(true)); }}>{copied ? messages.desktopDigestCopied : messages.copyDesktopDigest}</Button>
                </div>}
              </li>
            ))}
          </ul>
        </Card>
      ) : <Card><p role="status" className="text-sm text-muted">{githubUnavailable ? messages.desktopReleaseUnavailable : messages.noDesktopRelease}</p></Card>}
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
