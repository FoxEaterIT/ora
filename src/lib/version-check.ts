import packageJson from "../../package.json";

const CURRENT_VERSION = packageJson.version.replace(/^v/, "");
const RELEASES_URL = "https://api.github.com/repos/FoxEaterIT/ora/releases/latest";
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type VersionCheck = {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  updateAvailable: boolean;
};

let cached: { checkedAt: number; result: VersionCheck } | undefined;

function parseVersion(value: string) {
  const match = value.trim().replace(/^v/i, "").match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function isNewer(candidate: string, current: string) {
  const remote = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!remote || !installed) return false;
  for (let index = 0; index < 3; index += 1) {
    if (remote[index] !== installed[index]) return remote[index] > installed[index];
  }
  return false;
}

export async function getVersionCheck(): Promise<VersionCheck> {
  if (cached && Date.now() - cached.checkedAt < CHECK_INTERVAL_MS) return cached.result;

  let result: VersionCheck = { currentVersion: CURRENT_VERSION, latestVersion: null, releaseUrl: null, updateAvailable: false };
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Ora-version-check" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (response.ok) {
      const release: unknown = await response.json();
      if (release && typeof release === "object") {
        const data = release as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown };
        const tag = typeof data.tag_name === "string" ? data.tag_name : "";
        const releaseUrl = typeof data.html_url === "string" ? data.html_url : "";
        if (data.draft !== true && data.prerelease !== true && parseVersion(tag) && /^https:\/\/github\.com\/FoxEaterIT\/ora\/releases\/tag\//.test(releaseUrl)) {
          result = { currentVersion: CURRENT_VERSION, latestVersion: tag.replace(/^v/i, ""), releaseUrl, updateAvailable: isNewer(tag, CURRENT_VERSION) };
        }
      }
    }
  } catch {
    // Version checks are best-effort and must not affect app availability.
  }
  cached = { checkedAt: Date.now(), result };
  return result;
}
