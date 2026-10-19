# Ora

Ora helps small teams track project hours, manage people and teams, and export reports.

## Contents

- [Features](#features)
- [Quick start](#quick-start)
- [Configuration](#environment-variables)
- [Windows installation](#windows-installation-and-hosting)
- [Updating Ora](#updating-ora)
- [Reports and backups](#reports-and-backups)
- [Desktop panel preview](#desktop-panel-preview)
- [Desktop release readiness plan](docs/desktop-release-checklist.md)
- [Desktop security contract](docs/desktop-security-contract.md)
- [Desktop Phase 5 distribution plan](docs/desktop-phase5-plan.md)

## Features

| Area | What you can do |
|---|---|
| Time tracking | Track time on assigned projects, review personal timesheets, and delete your own entries. |
| Projects | Create projects and assign people. Owners and admins also manage teams, archive projects, and delete projects without time history. |
| Reports | Filter report data and export CSV or Excel files. |
| Backup | The Owner can download a complete Excel archive of projects, people, teams, and related time entries. |
| Preferences | Use English, Italian, or Spanish and choose from light and dark themes. |

> **Data protection:** Deactivating a person preserves their time history. Excel backups contain sensitive information and should be stored securely.

## Quick start

**Requirements:** Node.js 20 or newer and npm. SQLite is stored locally at `prisma/ORA.db`.

```bash
git clone https://github.com/FoxEaterIT/ora.git
cd ora
npm install
Copy-Item .env.example .env
npm run dev
```

Open [http://localhost:33333](http://localhost:33333). On first launch, leave `OWNER_EMAIL` and `OWNER_PASSWORD` empty and complete the one-time setup at `/setup`. The setup code is written to `owner-setup-code.txt` in the app directory. Protect access to this file and the server while setup is pending.

For production, set a strong random `AUTH_SECRET` and configure `.env` before building. See [Windows installation and hosting](#windows-installation-and-hosting).

> **Windows installer:** for a new installation, choose a free TCP port when prompted. Reinstalling or repairing an installation with `OraTimeTrackingService` already registered preserves the existing `.env` port.

## Environment variables

All variables are defined in [`.env.example`](.env.example). The installer creates `.env` and generates `AUTH_SECRET`; for manual setup, copy the example file and replace its placeholder secret before production use. Public `NEXT_PUBLIC_*` values are embedded at build time.

| Variable | Description | Requirement | Example |
|---|---|---|---|
| `PORT` | Local HTTP port | Optional; defaults to `33333` | `33333` |
| `AUTH_SECRET` | Signs session cookies; use a random value in production | Required | `replace-with-a-long-random-secret` |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Initial owner credentials; set both or leave both empty for `/setup` | Optional | Empty |
| `OWNER_NAME` | Initial owner display name | Optional | `Owner` |
| `APP_ORIGIN` | Public base URL, especially behind a reverse proxy | Optional | `https://ora.example.com` |
| `SESSION_COOKIE_NAME` | Session cookie name | Optional | `ora_session` |
| `SESSION_DURATION_DAYS` | Session lifetime in days | Optional | `7` |
| `PASSWORD_HASH_ROUNDS` | Password hash cost | Optional | `10` |
| `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TAGLINE`, `NEXT_PUBLIC_APP_DESCRIPTION` | Client-visible application branding | Optional | `Ora` |
| `NEXT_PUBLIC_APP_LOGO_LIGHT`, `NEXT_PUBLIC_APP_LOGO_DARK` | Custom logo paths under `public/custom/` | Optional | `/custom/logo.svg` |
| `NEXT_PUBLIC_DEFAULT_THEME`, `NEXT_PUBLIC_ORA_THEMES` | Initial theme and available light themes | Optional | `ora-default` |
| `NEXT_PUBLIC_THEME_*_LABEL`, `NEXT_PUBLIC_THEME_*_COLOR` | Labels and swatches for theme presets | Optional | `Ora blue`, `#2878c7` |
| `NEXT_PUBLIC_DEFAULT_PROJECT_COLOR`, `NEXT_PUBLIC_DEFAULT_TEAM_COLOR` | Default project and team colors | Optional | `#14b8a6` |
| `NEXT_PUBLIC_PROJECT_COLORS`, `NEXT_PUBLIC_TEAM_COLORS` | Comma-separated color palettes | Optional | `#14b8a6,#5b5bd6` |

The database path is fixed at `prisma/ORA.db`; it is not configurable.

## Windows installation and hosting

Run `install.cmd` as Administrator on Windows. It installs the production app under `%APPDATA%\Ora`, initializes the SQLite database, asks for an available TCP port (default `33333`), and registers the `OraTimeTrackingService` Windows service. During repair or reinstallation with the service already registered, the configured port in `.env` is preserved. Visit the installer’s displayed local URL and complete `/setup`.

The installer does not configure IIS, HTTPS, DNS, or firewall rules. For network access, put Ora behind a reverse proxy such as IIS with URL Rewrite and ARR. Keep Ora bound to `127.0.0.1`, set `APP_ORIGIN` to the public HTTPS URL, and do not expose the backend port directly to untrusted networks. See the [IIS reverse-proxy example](#iis-reverse-proxy-example) below.

### IIS reverse-proxy example

Install IIS, URL Rewrite, and Application Request Routing (ARR), then enable proxying in IIS Manager under **Application Request Routing Cache → Server Proxy Settings**. Save this as `web.config` in the physical folder for the IIS site, and update the port if `PORT` differs from its default:

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="Ora reverse proxy" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://127.0.0.1:33333/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

Create an IIS site using that folder and bind the intended hostname and HTTPS certificate. If installation selected a port other than `33333`, update the rewrite target to match the Ora port. Set `APP_ORIGIN` to the public URL, restart `OraTimeTrackingService`, and allow inbound traffic only to the proxy.

## Desktop panel preview

A preliminary Windows Tauri panel scaffold is available in [`src-tauri/`](src-tauri/README.md). It supports time tracking, Ora account sign-in, English/Italian/Spanish, and Windows-native secure session storage. It is not a supported release and must not be distributed. The release plan and current validation limits are tracked in the [desktop checklist](docs/desktop-release-checklist.md), [security contract](docs/desktop-security-contract.md), and [Phase 5 distribution plan](docs/desktop-phase5-plan.md).

> **Preview only:** Phase 4 was closed by project decision, not by completion of every release test. Clean-checkout reproducibility, manual keyboard/accessibility checks, native WebView testing, and Windows installer execution remain unverified. Local x64 MSI and NSIS packaging builds succeeded, but the manual release workflow and authenticated download notice have not been exercised against a published release. The workflow must be dispatched manually in GitHub Actions after the matching tagged release exists; running the server release script alone does not start it. SHA-256 digest display is not independent publisher authentication. There is no automatic desktop updater. Do not distribute the scaffold until all required release gates have been validated.

## Reports and backups

Managers can create filtered reports and export them as CSV or Excel files. The Owner-only complete backup is a ZIP containing separate Excel workbooks for projects, people, and teams, with related time-entry data. It is intended for review and archival, not database restoration.

> **SQLite restore:** The Excel archive is not a database snapshot. Offline SQLite backup and restore must be handled by an administrator with the Ora Windows service stopped. Keep a verified database copy before maintenance.

### Updating Ora

`install.cmd` registers the `OraTrackingServiceUpdater` Windows service. The updater broker accepts only fixed local update commands through a restricted named pipe; its installation path and status file are pinned at installation.

When a release is available, an owner or admin can select **Install update** in the app header. The external updater verifies the release, checks the existing service, configured port, HTTP health, installation path, and database, then migrates a staged database copy before activating the update. It stops and restarts `OraTimeTrackingService` only for activation, retains rollback and database backups, and checks Ora's HTTP health afterward. Older installations without the updater broker can be enrolled by running the external updater from an elevated PowerShell session.

> **Legacy installation without the updater service:** the in-app update trigger cannot reach a broker that is not installed. Run the external updater from an elevated PowerShell session. It automatically detects the Ora installation at `%APPDATA%\Ora` or from the running `OraTimeTrackingService` working directory, so no path argument is required. For example: `& "$env:APPDATA\Ora\scripts\update.ps1"`. The updater installs or refreshes `OraTrackingServiceUpdater` after a newer app release has been activated and `OraTimeTrackingService` is healthy. If no newer release exists, no service bootstrap occurs; install/update Ora to a newer release first. Do not run this against a production installation without a verified database backup and the normal maintenance precautions.

While an update is in progress, Ora reports its status and tolerates the brief service interruption. The web process does not elevate itself or replace its own files; the broker must be running with an account authorized to update the installation.

> **Before maintenance:** keep a verified database backup. If a health or database preflight check fails, resolve the installation issue before retrying.

## License

[MIT](./LICENSE).
