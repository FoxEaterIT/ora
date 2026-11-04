"use client";

import { useState } from "react";
import { AlertCircle, DownloadCloud, Info } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { useI18n } from "@/i18n/provider";

/**
 * A guided update notice for the Ora Desktop app.
 * Displays information about a new release, including version, download link, and checksum.
 */
export function DesktopUpdateNotice({ release }: { release: { version: string; releaseUrl: string; body: string; assets: { name: string; url: string; digest?: string | null }[] } }) {
  const { messages } = useI18n();
  const desktopInstaller = release.assets.find((asset) => asset.name.toLowerCase().endsWith(".msi")) ?? release.assets.find((asset) => asset.name.toLowerCase().endsWith(".exe"));
  const [showDigest, setShowDigest] = useState(false);

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 mb-6">
      <Card className="border-brand/30 bg-surface-raised shadow-lg">
        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="bg-brand/10 p-2 rounded-full text-brand">
                <AlertCircle size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-ink">
                  {messages.desktopReleaseAvailable.replace("{version}", release.version)}
                </h3>
                <p className="text-sm text-muted">{messages.desktopReleasePageSubtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={() => window.open(release.releaseUrl, "_blank")}>
                {messages.viewRelease}
              </Button>
              <Button onClick={() => window.open(desktopInstaller?.url || release.releaseUrl, "_blank")}>
                <DownloadCloud size={16} className="mr-2" />
                {messages.downloadDesktop}
              </Button>
            </div>
          </div>
          {desktopInstaller?.digest && <div className="mt-4 border-t border-line/70 pt-4">
            <button type="button" aria-expanded={showDigest} aria-label={showDigest ? messages.hideDesktopDigest : messages.showDesktopDigest} title={messages.showDesktopDigest} onClick={() => setShowDigest((open) => !open)} className="ora-icon-disc text-muted hover:text-ink">
              <Info size={17} aria-hidden="true" />
            </button>
            {showDigest && <div className="mt-3 rounded-xl bg-surface-sunken/60 p-3">
              <p className="text-xs text-muted">{messages.desktopDigestNote}</p>
              <p className="mt-2 break-all font-mono text-xs text-ink">{desktopInstaller.digest}</p>
            </div>}
          </div>}
        </div>
      </Card>
    </div>
  );
}