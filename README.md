# Ora

Ora helps small teams track project hours, manage people and teams, and export reports.

## Contents

- [What Ora does](#what-ora-does)
- [Get started](#get-started)
- [Configure Ora](#configure-ora)
- [Install and host on Windows](#install-and-host-on-windows)
- [Update Ora](#update-ora)
- [Reports and backups](#reports-and-backups)
- [Uninstall Ora](#uninstall-ora)
- [Desktop preview](#desktop-preview)
- [License](#license)

## What Ora does

| Area | What you can do |
|---|---|
| Time tracking | Track time on assigned projects. The web Timer and Tauri desktop panel share the Timer React view through separate API adapters. The web My hours page and desktop panel also share a view; desktop is currently read-only, while web supports manual entry creation, editing, and deletion. The desktop API remains constrained to its allowlisted routes, and project deletion is unavailable in desktop mode. The responsive web tables scroll horizontally on narrow screens. |
| Projects | Create projects and assign people. Owners and admins also manage teams, archive projects, and delete projects without time history. |
| Reports | Filter report data and export CSV or Excel files. Ora Desktop does not support report exports. |
| Backup | The Owner can download a complete Excel archive of projects, people, teams, and related time entries. |
| Preferences | Use English, Italian, or Spanish and choose from light and dark themes. Theme text and status colors are tuned for WCAG AA contrast across the web and standalone desktop palettes. Ora provides visible keyboard focus, keyboard-operable dialogs/navigation, and respects the operating system's reduced-motion preference. Confirmation and error prompts appear in Ora's themed dialogs. |

> **Data protection:** Deactivating a person preserves their time history. Excel backups contain sensitive information and should be stored securely.

## Get started

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

## Configure Ora

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

## Install and host on Windows

Run `install.cmd` as Administrator on Windows. It installs the production app under `%APPDATA%\Ora`, initializes the SQLite database, asks for an available TCP port (default `33333`), and registers the `OraTimeTrackingService` Windows service. During repair or reinstallation with the service already registered, the configured port in `.env` is preserved. Visit the installer's displayed local URL and complete `/setup`.

The installer registers `OraTimeTrackingService`, the updater broker, and `OraTimeTrackingDeletion`. The deletion broker runs separately from the web process and accepts only fixed local uninstall/status requests. Older installations without it must run the elevated Ora installer/repair before in-app uninstall is available. Optional project/team/people Excel inventories are saved under `Documents\Ora-Uninstall-Exports`; preserved application data is saved separately under `Documents\Ora-Uninstall-Data-<timestamp>`.

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

## Update Ora

The Windows installer registers the `OraTrackingServiceUpdater` service. When a release is available, an Owner or Admin can choose **Install update** in the app header. Before activation, the updater checks the release, service, configured port, HTTP health, installation path, and database, then migrates a staged database copy. It retains rollback and database backups and checks Ora's health after restarting the service.

> **Older installations:** if the updater service is missing, the in-app update action cannot work. From elevated PowerShell, run `& "$env:APPDATA\Ora\scripts\update.ps1"` to invoke the external updater. It detects the installation path automatically. Use this only after making and verifying a database backup; if no newer release is available, it will not bootstrap the updater service.

The web process never elevates itself or replaces its own files. A restricted local broker handles update requests. If a health or database preflight check fails, resolve the issue before retrying.

## Reports and backups

Owners and Admins can create filtered reports and export them as CSV or Excel files. The Owner can download a complete archive ZIP containing separate workbooks for projects, people, and teams, including related time-entry data. Use this archive for review and record keeping; it is not a restorable database backup.

> **SQLite backup and restore:** An administrator must stop the Ora Windows service before backing up or restoring the SQLite database. Keep a verified database copy before maintenance.

## Uninstall Ora

The Owner can open **Uninstall Ora** from the app navigation. First download the complete Excel archive. Then choose separately whether to preserve the app configuration, SQLite data, database backup, and custom logos in Documents, and whether to create separate project, team, and people inventories. Type `YES` to confirm. Requested exports and retained data are prepared before service or application removal. If a safety check, export, or service operation fails, the worker records its status and stops rather than proceeding with unsafe database removal. Older installations without the deletion broker require an elevated installer repair first.

> **Separate products:** uninstalling Ora does not uninstall Ora Desktop. Remove it separately from Windows **Settings → Apps → Installed apps**.

## Desktop preview

Ora Desktop is an early Windows companion panel for connecting to an Ora server. It supports the Timer, Projects, and read-only My hours views, plus named server profiles. It does not support report exports, and it is not included in Ora's server installer or updater. The window is fixed-size (380 × 680 px).

> **Preview only:** native Windows/WebView behavior, Credential Manager, installer lifecycle, accessibility, and interactive two-server use have not been fully verified. Do not distribute this preview. Follow the [desktop user and test guide](src-tauri/README.md) for local setup and safe test steps; see the [release checklist](docs/desktop-release-checklist.md) for remaining gates.

## License

[MIT](./LICENSE).
