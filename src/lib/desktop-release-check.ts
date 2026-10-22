const RELEASES_URL = "https://api.github.com/repos/FoxEaterIT/ora/releases/latest";
const RELEASE_URL = /^https:\/\/github\.com\/FoxEaterIT\/ora\/releases\/tag\/[\w.-]+$/;
const MSI_NAME = /^ora-desktop-v\d+\.\d+\.\d+\.msi$/i;
const NSIS_NAME = /^ora-desktop-v\d+\.\d+\.\d+-setup\.exe$/i;

export type DesktopRelease = { version: string; releaseUrl: string; body: string; assets: { name: string; url: string }[] };
let cached: { at: number; value: DesktopRelease | null } | undefined;

export async function getDesktopRelease(): Promise<DesktopRelease | null> {
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) return cached.value;
  let value: DesktopRelease | null = null;
  try {
    const response = await fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Ora-desktop-release-check" }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (response.ok) {
      const data: unknown = await response.json();
      if (data && typeof data === "object") {
        const release = data as { tag_name?: unknown; html_url?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
        const version = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/i, "") : "";
        const releaseUrl = typeof release.html_url === "string" ? release.html_url : "";
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const marked = typeof release.body === "string" && /Ora-Desktop-Release:\s*true/i.test(release.body);
        if (marked && release.draft !== true && release.prerelease !== true && /^\d+\.\d+\.\d+$/.test(version) && RELEASE_URL.test(releaseUrl)) {
          const installers = assets.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const asset = item as { name?: unknown; browser_download_url?: unknown };
            const name = typeof asset.name === "string" ? asset.name : "";
            const url = typeof asset.browser_download_url === "string" ? asset.browser_download_url : "";
            if (!(MSI_NAME.test(name) || NSIS_NAME.test(name)) || !url.startsWith("https://github.com/FoxEaterIT/ora/releases/download/")) return [];
            return [{ name, url }];
          });
          if (installers.length) value = { version, releaseUrl, body: typeof release.body === "string" ? release.body.replace(/\r\n/g, "\n").replace(/^\s*Ora-Desktop-Release:\s*true\s*$/gim, "").replace(/\n{3,}/g, "\n\n").trim() : "", assets: installers };
        }
      }
    }
  } catch { /* GitHub metadata is best-effort and must not affect app availability. */ }
  cached = { at: Date.now(), value };
  return value;
}
