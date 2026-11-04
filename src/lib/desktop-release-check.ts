const RELEASES_URL = "https://api.github.com/repos/FoxEaterIT/ora/releases/latest";
const RELEASE_URL = /^https:\/\/github\.com\/FoxEaterIT\/ora\/releases\/tag\/[\w.-]+$/;
const MSI_NAME = /^ora-desktop-v\d+\.\d+\.\d+\.msi$/i;
const NSIS_NAME = /^ora-desktop-v\d+\.\d+\.\d+-setup\.exe$/i;
const CHECKSUM_NAME = /^SHA256SUMS\.txt$/i;
const CHECKSUM_LINE = /^([a-f0-9]{64}) {2}(\S+)$/i;

export type DesktopReleaseAsset = { name: string; url: string; digest: string | null };
export type DesktopRelease = { version: string; releaseUrl: string; body: string; assets: DesktopReleaseAsset[]; githubUnavailable?: false };
export type DesktopReleaseStatus = DesktopRelease | { githubUnavailable: true };
let cached: { at: number; value: DesktopReleaseStatus | null } | undefined;

export function resetDesktopReleaseCacheForTests() {
  cached = undefined;
}

export function parseDesktopChecksums(text: string) {
  const digests = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const match = CHECKSUM_LINE.exec(line.trim());
    if (match) digests.set(match[2], match[1].toLowerCase());
  }
  return digests;
}

export async function getDesktopRelease(): Promise<DesktopReleaseStatus | null> {
  if (cached && Date.now() - cached.at < 12 * 60 * 60 * 1000) return cached.value;
  let value: DesktopReleaseStatus | null = null;
  try {
    const response = await fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json", "User-Agent": "Ora-desktop-release-check" }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!response.ok) {
      value = { githubUnavailable: true };
    } else {
      const data: unknown = await response.json();
      if (data && typeof data === "object") {
        const release = data as { tag_name?: unknown; html_url?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown; assets?: unknown };
        const version = typeof release.tag_name === "string" ? release.tag_name.replace(/^v/i, "") : "";
        const releaseUrl = typeof release.html_url === "string" ? release.html_url : "";
        const assets = Array.isArray(release.assets) ? release.assets : [];
        const marked = typeof release.body === "string" && /Ora-Desktop-Release:\s*true/i.test(release.body);
        if (marked && release.draft !== true && release.prerelease !== true && /^\d+\.\d+\.\d+$/.test(version) && RELEASE_URL.test(releaseUrl)) {
          const parsed = assets.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const asset = item as { name?: unknown; browser_download_url?: unknown };
            const name = typeof asset.name === "string" ? asset.name : "";
            const url = typeof asset.browser_download_url === "string" ? asset.browser_download_url : "";
            if (!url.startsWith("https://github.com/FoxEaterIT/ora/releases/download/")) return [];
            if (MSI_NAME.test(name) || NSIS_NAME.test(name) || CHECKSUM_NAME.test(name)) return [{ name, url }];
            return [];
          });
          const installers = parsed.filter((asset) => !CHECKSUM_NAME.test(asset.name));
          const checksum = parsed.find((asset) => CHECKSUM_NAME.test(asset.name));
          if (installers.length) {
            let digests = new Map<string, string>();
            if (checksum) {
              try {
                const checksumResponse = await fetch(checksum.url, { signal: AbortSignal.timeout(4000), cache: "no-store" });
                if (checksumResponse.ok) digests = parseDesktopChecksums(await checksumResponse.text());
              } catch { /* A missing digest stays hidden; it must not hide a valid release. */ }
            }
            value = {
              version,
              releaseUrl,
              body: typeof release.body === "string" ? release.body.replace(/\r\n/g, "\n").replace(/^\s*Ora-Desktop-Release:\s*true\s*$/gim, "").replace(/\n{3,}/g, "\n\n").trim() : "",
              assets: installers.map((asset) => ({ ...asset, digest: digests.get(asset.name) ?? null })),
            };
          }
        }
      }
    }
  } catch {
    value = { githubUnavailable: true };
  }
  cached = { at: Date.now(), value };
  return value;
}
