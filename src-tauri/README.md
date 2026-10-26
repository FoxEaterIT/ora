# Ora Desktop Preview

Ora Desktop is a Windows companion panel for tracking time on an Ora server. This guide explains what the preview can do, how to try it safely, and what is not yet verified.

## What you can do

| Feature | Desktop preview behavior |
| --- | --- |
| Time tracking | Start and stop a timer on a project; the desktop scope is limited to tracking workflows |
| Server profiles | Sign in to an Ora server and save, select, or remove named server profiles |
| Web-only features | Projects, My hours, reports, backups, account administration, and other management functions remain in the web app |
| Sign-in | Store a separate session credential for each server origin in Windows Credential Manager |
| Language | Use English, Italian, or Spanish |

The desktop panel is separate from the Ora web server. Installing or updating Ora does not install or update Ora Desktop.

## Try the preview locally

### Requirements

- Windows, Node.js 20 or newer, and npm dependencies installed for the Ora repository.
- Rust, the Tauri CLI, and Microsoft WebView2.
- A disposable Ora server/database and test accounts.

See the [Tauri Windows prerequisites](https://tauri.app/start/prerequisites/) for current setup instructions. Do not seed demo users into a database containing real users: the seed script resets the demo accounts when they already exist.

### Start the app

From the repository root, install dependencies if needed, then start the web server:

```powershell
npm install
npm run desktop:dev
```

The Tauri configuration uses `npm run desktop:dev` as its development server on `http://localhost:33334`. In another PowerShell window, start Tauri from the `src-tauri` directory:

```powershell
cd src-tauri
cargo tauri dev
```

If `cargo tauri` is unavailable, install the Tauri CLI using the official setup guide. When the panel opens, enter the origin of your test server and sign in with an Ora account.

### Optional demo accounts

The script `scripts/seed-desktop-demo.ts` creates or resets two users in the database selected by the app's Prisma configuration:

- Owner: `owner.demo@ora.local` / `OraDemoOwner2026!`
- User: `user.demo@ora.local` / `OraDemoUser2026!`

Run the script only against a disposable test database. It is not a production setup command and must never be used with real user data or an exposed server.

### Build the desktop frontend

To generate the static frontend used by production Tauri builds, run this from the repository root:

```powershell
npm run desktop:build:frontend
```

The build generates a content-named HTML entry point and a restrictive Content Security Policy. The development server is used only for local development; production builds use the generated static files.

## Test the main workflows

Use test accounts and test servers throughout.

1. **Sign-in and session restore:** sign in, restart the panel, confirm the session restores, then sign out.
2. **Timer:** start and stop a timer on a test project.
3. **Two server profiles:** sign in to two test servers, switch between them, and confirm each profile uses only its own session. Remove one profile and confirm the other still works.
4. **Offline recovery:** temporarily stop one test server, confirm the panel reports the connection problem, then retry after the server returns.
5. **Web-only actions:** confirm projects, My hours, reports, backups, account administration, and other management workflows are not exposed in desktop.
6. **Windows credential storage:** verify session restore and profile isolation under the Windows account running the test. Cross-account isolation still needs a separate Windows-account test.

The app asks for confirmation before removing a profile. It rejects API redirects and requests outside the desktop allowlist before forwarding a session token. Temporary restore errors should retain credentials; explicit 401/403 responses should remove only the selected profile's rejected credential.

## Security and network use

Sign in with your Ora account through the dedicated `/api/desktop/login` endpoint. Desktop access is limited to an allowlist of API routes; it does not provide all web-app capabilities.

Both HTTP and HTTPS server origins are supported. **HTTP traffic is unencrypted.** Use HTTP only on a trusted network; the app requires explicit approval for remote HTTP origins. Prefer HTTPS whenever available.

Session tokens are stored in Windows Credential Manager under a key derived from the normalized server origin. Remembered HTTP approvals are also kept separately per origin. These protections are implemented in source, but native Windows Credential Manager behavior has not yet been fully validated.

## Distribution and updates

Ora Desktop is not included in the Ora server installer or server updater. The manual [desktop release workflow](../.github/workflows/desktop-release.yml) builds MSI and NSIS installers for an already-published stable release marked `Ora-Desktop-Release: true`; it attaches installer files and `SHA256SUMS.txt`, but does not publish releases or change version numbers.

The preview must not be distributed until the open release checks are complete. See the [desktop release checklist](../docs/desktop-release-checklist.md), [Phase 5 plan](../docs/desktop-phase5-plan.md), and [desktop security contract](../docs/desktop-security-contract.md) for engineering and release details.

## Known validation gaps

The following have not been verified end to end:

- Interactive use in the native Tauri window and Windows WebView.
- Windows Credential Manager behavior, including isolation between Windows accounts.
- Clean-machine installation and reproducible packaging.
- Installer, repair, update, and uninstall lifecycle.
- Interactive use with two separate Ora servers.
- Release security review and accessibility checks.

Automated adapter tests and frontend builds cover only parts of the code; they do not prove these Windows behaviors. Phase 3 was marked complete by project decision, but clean-machine and cross-account tests were not run.