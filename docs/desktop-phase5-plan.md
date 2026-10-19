# Desktop Phase 5 — Distribution and operations plan

This document turns the approved Phase 5 decisions into an implementation and validation plan. Phase 5 does not make Ora Desktop releasable by itself; Phase 6 and the overall release gates still apply. It does not authorize publishing a desktop release.

## Approved decisions

| Area | Decision |
|---|---|
| Platform and package | Standalone Windows desktop installer (MSI/NSIS), separate from the Ora server installer. Windows 10/11 with WebView2, as defined by the security contract. |
| Delivery | Authenticated Ora users receive a manual download link in the web app. No automatic client updater. |
| Release source | Stable GitHub Releases for `FoxEaterIT/ora`; only a release explicitly marked as containing a desktop build may be offered. |
| Integrity information | Display the GitHub asset's SHA-256 digest in Ora and link to the GitHub release. The digest is useful for detecting accidental corruption or mismatch, but is not an independent authenticity proof if the release account or asset metadata is compromised. |
| Update behavior | Notify with version, installer link, and digest; user downloads and installs manually. Reinstalling over the current installation should preserve the Windows-user keyring session and local preferences. No automatic rollback or downgrade guarantee. |
| Uninstall | Remove the desktop app's fixed Credential Manager token and desktop WebView preferences (including origin, locale, theme, and remembered HTTP confirmations); do not affect Ora server data or time entries. |
| Stop distribution | Remove/disable the desktop download from the authenticated app and mark the affected GitHub release as withdrawn with a clear note. No client kill switch. |
| Rollout | Publish to a limited pilot audience first, monitor support reports, then enable the download more broadly. Preserve release assets and evidence; withdrawal is a server-side availability decision, not remote revocation of already downloaded installers. |
| Testing boundary | Define and document upgrade, uninstall, and recovery tests. Where clean/previously-upgraded Windows machines are unavailable, report the test gate as unverified and do not claim success. The project may close Phase 5 by decision with this limitation recorded. |

## Current architecture findings

- `src-tauri/tauri.conf.json` builds MSI and NSIS installers; `.github/workflows/desktop-release.yml` defines the manual desktop artifact workflow and release asset convention.
- `.github/workflows/release-archive.yml` creates the existing server source ZIP on each GitHub release. It is not a desktop installer and must not be presented as one.
- `scripts/publish-release.ps1` publishes Ora web releases by bumping `package.json`; the desktop version is separately maintained in Tauri/Cargo. A desktop release must validate this pair without silently changing either version.
- `src/lib/version-check.ts` and `/api/version` currently serve the web-service updater notice to managers. Desktop availability must be represented separately and must never trigger `/api/update` or reuse the service updater.
- `Shell` is the shared authenticated UI, and `src/i18n/messages.ts` holds EN/IT/ES user-facing strings. The desktop release notice and download labels are localized in all dictionaries.
- Desktop tokens are in the fixed `OraDesktop/session` Windows Credential Manager entry. UI preferences are stored by the Tauri WebView; uninstall cleanup must target only Ora Desktop's own storage and must be tested for both MSI and NSIS.

## Implementation sequence

1. **Release metadata and artifact pipeline**
   - [x] Establish the release marker `Ora-Desktop-Release: true`, installer naming contract (`ora-desktop-v<version>.msi` and `ora-desktop-v<version>-setup.exe`), and manual-only workflow dispatch in `.github/workflows/desktop-release.yml`.
   - [x] Validate the stable `vMAJOR.MINOR.PATCH` tag against `tauri.conf.json` and `Cargo.toml`; the workflow builds MSI/NSIS on Windows and generates a `SHA256SUMS.txt` manifest.
   - [x] Attach installers and checksum manifest to the existing matching GitHub Release with `--clobber`; the workflow does not create/publish releases or alter versions. Never treat `ora-v*.zip` as the desktop installer.
   - [x] Use the repository `GITHUB_TOKEN` with `contents: write`; no signing credentials or client secrets are introduced. Local x64 MSI/NSIS packaging succeeded, but the GitHub workflow and attached release artifacts have not been validated.
   - **Current trigger:** `scripts/publish-release.ps1` updates package.json and desktop Tauri/Cargo versions together, adds the `Ora-Desktop-Release: true` release-note marker, creates and publishes the tag/release, then dispatches this workflow with the tag. Installer generation and upload are asynchronous; the script confirms dispatch only, not workflow success.
2. **Authenticated app notice and manual download**
   - Add a distinct server-side desktop-release lookup, available to authenticated Ora users, independent from manager-only web updater status.
   - Accept only stable releases with valid desktop marker, semantic desktop version, expected MSI/NSIS asset names, HTTPS GitHub URLs, and a valid GitHub-provided SHA-256 digest. Fail closed on missing or malformed fields; cache best-effort metadata and never block Ora if GitHub is unavailable.
   - Show an EN/IT/ES localized notice with version, asset link, and digest; do not start a download or installation automatically. Avoid exposing update controls in the Tauri desktop-mode shell unless explicitly designed.
   - Keep download links on GitHub; the authenticated Ora page gates discovery/link visibility, while the public release asset remains public. Do not imply the link itself is authenticated or access-controlled.
3. **Install, upgrade, uninstall, and recovery policy**
   - Confirm MSI and NSIS upgrade behavior and document supported installation mode. Reinstall-over-install preserves the token and preferences; a clean uninstall removes both.
   - Add narrowly scoped uninstall cleanup for the fixed `OraDesktop/session` keyring entry and Ora Desktop WebView preference data, without deleting user time data, server files, or unrelated WebView/app data.
   - Define rollback as manual installation of a prior known-good release; document that no automatic rollback or downgrade protection is implemented. A withdrawn release is hidden from the web app and annotated on GitHub, but already downloaded installers cannot be recalled.
   - Do not implement a server-configured origin or embed per-server settings into the standalone package unless the server-installer integration is separately redesigned; the current contract says the URL remains user-editable and installers are not rebuilt per server.
4. **Operations, verification, and rollout**
   - Document WebView2 prerequisite, firewall/proxy access to the configured Ora server and GitHub release assets, HTTPS certificate expectations, explicit confirmation and risk of remote HTTP, offline behavior, and safe diagnostics.
   - Diagnostics must not include passwords, raw desktop tokens, full email addresses, or keyring contents. Include app version, server origin with sensitive URL components rejected, locale, and non-secret error category only where useful.
   - Define pilot enablement, support monitoring, withdrawal steps, and re-enable criteria. Withdrawal must be server-side and reversible without deleting GitHub evidence.
   - Test workflow outputs and SHA-256 matching; test authenticated/unauthenticated notice behavior, invalid/missing GitHub metadata, GitHub outage fallback, MSI/NSIS install and reinstall, token/preference preservation, uninstall cleanup, and manual rollback. Record Windows clean-machine and previously-upgraded-machine evidence separately.

## Release and security boundaries

The application lookup/manual notice and manual GitHub Actions packaging workflow are implemented. A local Windows x64 release build completed successfully and produced MSI (2.70 MiB) and NSIS (1.79 MiB) bundles after 3m45s; the Rust linker emitted one warning. This verifies local packaging only, not installation or runtime behavior. The workflow has not been run against a published GitHub Release; artifact renaming, checksum attachment, and runtime installer behavior therefore remain unverified. The workflow dispatch must not be used until the release tag, marker, and explicit release approval are confirmed.

- The first desktop package may be unsigned under the existing approved contract; SmartScreen warnings are expected. Do not claim a checksum authenticates the publisher.
- No automatic updater, client-side update downloader, remote kill switch, or reuse of the Ora Windows service updater is part of this plan.
- Never bump versions or publish artifacts as part of routine implementation. A release requires its own explicit preparation and confirmation.
- Do not mark installer/uninstaller recovery tests passed based only on a successful build. Installer runtime validation requires Windows test machines and is recorded separately.
