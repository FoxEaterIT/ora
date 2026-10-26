# Ora

Ora is a self-hosted time-tracking app for small teams. Track hours against projects, organize people and teams, review time entries, and export reports while keeping the application database on your own server.

![Track project time](docs/readme/track.svg)

## Jump to

- [At a glance](#at-a-glance)
- [What you need](#what-you-need)
- [Install and start](#install-and-start)
- [First-time setup](#first-time-setup)
- [Roles and permissions](#roles-and-permissions)
- [Everyday use](#everyday-use)
- [Reports and exports](#reports-and-exports)
- [Backups and data safety](#backups-and-data-safety)
- [Configuration](#configuration)
- [Windows server installation](#windows-server-installation)
- [Hosting behind IIS](#hosting-behind-iis)
- [Updating](#updating)
- [Uninstalling](#uninstalling)
- [Ora Desktop preview](#ora-desktop-preview)
- [Technology stack](#technology-stack)
- [Troubleshooting](#troubleshooting)
- [Privacy and security](#privacy-and-security)
- [License](#license)

## At a glance

| Area | Ora provides |
|---|---|
| Time tracking | A live timer and personal time-entry management in the web app. Users can create, edit, and delete their own entries. |
| Projects | Project creation and member assignment for all signed-in roles; Owner/Admin controls for teams, archiving, and eligible project deletion. |
| People and teams | Role-aware user and team administration, including reversible user deactivation that preserves recorded history. |
| Reports | Filtered reports grouped by project, team, or person, with CSV and Excel export. |
| Complete archive | An Owner-only Excel ZIP archive with project, people, and team workbooks and related time-entry data. It is not a restorable database backup. |
| Preferences | English, Italian, or Spanish; light theme presets and dark mode; keyboard-operable navigation and dialogs. |
| Hosting | A Next.js web application with a local SQLite database; the Windows installer can register it as a service. |
| Desktop companion | A limited Windows preview for server profiles and time tracking. It is separate from the web app and is not ready for general distribution. |

![Organize projects and teams](docs/readme/organize.svg)

> **Keep data safe:** protect the server and its database, and keep verified backups before maintenance or updates. Excel exports contain potentially sensitive employee and project information.

## What you need

### To run from source

- Windows, macOS, or Linux with a supported Node.js installation; **Node.js 20 or newer** and npm are required by the project guide.
- The repository and its npm dependencies.
- Persistent writable storage for the SQLite database at `prisma/ORA.db`.

### For the Windows service installer

- A Windows machine and an elevated Administrator session.
- The installer can install Node.js when required, using winget where available.
- A free local TCP port for a new installation. The default is `33333`.

Ora is designed for a single application instance using persistent local SQLite storage. Do not point multiple independently running Ora instances at the same SQLite file.

## Install and start

### Run from a checkout

```bash
git clone https://github.com/FoxEaterIT/ora.git
cd ora
npm install
```

Copy `.env.example` to `.env` (PowerShell shown):

```powershell
Copy-Item .env.example .env
```

Before production use, edit `.env` and replace the placeholder `AUTH_SECRET` with a long random secret. Set `PORT` if needed, then run the development server:

```bash
npm run dev
```

Open the URL shown by the server; the default is [http://localhost:33333](http://localhost:33333). The development command is for local development, not a production service. For a production build from source, use the deployment procedure maintained for your environment and configure `.env` before building; `npm run build` generates Prisma Client, deploys pending migrations, and builds the Next.js application. The `start` script also deploys pending migrations before starting Next.js.

> **Database caution:** `npm run build` and `npm start` may apply pending migrations to the database selected by the runtime configuration. Back up the database first, and do not use a production database for experiments.

### Install as a Windows service

For a supported, managed Windows installation, use the [Windows server installation](#windows-server-installation) procedure rather than leaving a development server running in a terminal.

## First-time setup

On first launch, choose one of the following provisioning paths:

1. **Setup page:** leave `OWNER_EMAIL` and `OWNER_PASSWORD` empty, open `/setup`, and follow the one-time owner setup flow. Ora writes a temporary setup code to `owner-setup-code.txt` in the app root. Restrict access to the file and remove it through the setup flow.
2. **Environment provisioning:** set both `OWNER_EMAIL` and `OWNER_PASSWORD` before initial provisioning. Set both or leave both empty; do not configure only one.

After creating the Owner account:

1. Sign in and confirm the account details.
2. Create teams and invite or create people as appropriate for your installation.
3. Create projects and assign the people who should track time against them.
4. Review the app's language and theme preferences.
5. Download and securely store an initial archive; separately arrange a proper SQLite database backup.

There is one Owner per installation. Keep the Owner account protected: it controls the complete archive and other installation-wide management actions.

## Roles and permissions

| Role | Typical access |
|---|---|
| **Owner** | Full management access, complete Excel archive, and Owner-only account and uninstall operations. There is one Owner per installation. |
| **Admin** | Team and people administration, reports/exports, and other manager operations. Cannot take over Owner-only controls. |
| **User** | Personal timer and time entries, project access, and project creation/member assignment allowed by the app. Cannot manage teams, archive/delete projects, or export manager reports. |

All authenticated roles can access Projects and manage project-member assignments. Team administration, project archiving, and project deletion are restricted to Owner/Admin. Project deletion is limited to projects without time-entry history. Users can delete only their own entries; manager status does not grant cross-user time-entry deletion. Deactivating a person blocks access but retains their historical time records.

> The interface hides controls a role cannot use, but permissions are enforced by the server as well. Do not rely on hiding a page link as a security boundary.

## Everyday use

### Track time

1. Open **Timer** and choose an available project.
2. Start the timer when work begins and stop it when the work session ends.
3. Review recent completed entries. The web app allows you to edit an entry's start/end and delete your own completed entries.
4. Use **My hours** to review your personal history and manage your own entries.

Ora prevents more than one active timer for the same user. If a start request conflicts with an already-active timer, stop or review that timer before starting another. An empty end time means the timer is still running.

### Projects and membership

- Create projects and assign one or more active people as members.
- Project membership controls which projects are available for tracking.
- Owner/Admin users can also manage team association and archive projects.
- Only projects without time entries can be deleted; historical time records are protected.

### People and teams

Owner/Admin users can manage people and teams. User deactivation is reversible and preserves the person's time history; reactivate the account if access should resume. Changes to assignments use active users, so review project memberships when changing a person's status.

### Language, theme, and navigation

Choose English, Italian, or Spanish from the language control. Theme preferences are stored in the browser and remain after sign-out. Ora includes the default light theme, optional blue/green/purple/orange light presets, and dark mode. On narrow screens the navigation opens as a left-side panel; at wider sizes it remains a visible rail. Keyboard focus is visible, dialogs can be operated with a keyboard, and the interface honors reduced-motion preferences.

## Reports and exports

Owners and Admins can open **Reports** and:

1. Select a grouping focus: **project**, **team**, or **user**.
2. Set date bounds and choose one or more people, projects, or teams where applicable.
3. Select the time-entry fields to include in exported rows.
4. Generate the report and choose CSV or Excel.

Date filtering uses each time entry's start timestamp. The chosen final date includes the complete day. Multiple selected values within a single filter are combined; different filter types intersect. The server deduplicates repeated filter IDs and returns each matching entry once.

| Export selection | Result |
|---|---|
| One item in CSV mode | One CSV file |
| Multiple items in CSV mode | A ZIP with a separate CSV file for each item |
| Excel mode | A workbook with one worksheet per item; sheet names are made unique and limited to Excel's 31-character maximum |

Report exports have configured row and column limits. The complete Owner archive is a different feature: it includes separate project, people, and team workbooks with linked time-entry data, but it is not a SQLite restore point.

![Build and export reports](docs/readme/report.svg)

## Backups and data safety

Ora has two different kinds of export/backup; use the right one:

| Method | What it contains | What it is for |
|---|---|---|
| Owner complete Excel archive | Project, people, and team workbooks plus related time-entry data | Human-readable records and reporting; not suitable for restoring the live application database |
| SQLite database backup | The application database, including its records and relationships | Database recovery and migration/maintenance recovery |

The in-app complete Excel archive is Owner-only. For a consistent offline SQLite copy, an administrator must stop the Ora Windows service before copying or restoring the database. Ora's Windows updater creates and verifies staged/retained database copies during its update workflow, but administrators should still keep an independent verified backup.

- Store backups somewhere separate from the application installation.
- Restrict access and use encryption appropriate to your environment.
- Verify that a backup can be opened or restored before relying on it.
- Never test restore procedures against the only copy of production data.
- Do not upload real databases or Excel archives to public issue trackers.

## Configuration

`.env.example` documents configuration. `.env` is the runtime/build configuration source. Keep secrets private. Values beginning with `NEXT_PUBLIC_` are embedded in the client bundle and must not contain secrets; set branding and theme options before building.

| Variable | Purpose | Default or notes |
|---|---|---|
| `PORT` | Local HTTP port | `33333`; Windows installer asks for a free port on a fresh install. |
| `AUTH_SECRET` | Signs session cookies | Required in production; replace the example placeholder with a long random value. |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Initial Owner provisioning | Set both together, or leave both empty for `/setup`. Used for initial provisioning, not routine password changes. |
| `OWNER_NAME` | Initial Owner display name | `Owner` |
| `APP_ORIGIN` | Public application origin | Set to the public HTTPS URL when using a reverse proxy. |
| `SESSION_COOKIE_NAME` | Session cookie name | `ora_session` |
| `SESSION_DURATION_DAYS` | Session lifetime | `7` |
| `PASSWORD_HASH_ROUNDS` | Password hashing cost | `10` |
| `NEXT_PUBLIC_APP_NAME` | Web app name | `Ora` |
| `NEXT_PUBLIC_APP_TAGLINE`, `NEXT_PUBLIC_APP_DESCRIPTION` | Client-visible product copy | Optional; branding only. |
| `NEXT_PUBLIC_APP_LOGO_LIGHT`, `NEXT_PUBLIC_APP_LOGO_DARK` | Custom web logos | Optional. Put files only in `public/custom/` and use `/custom/...` paths. If one is set, it is used in both modes. |
| `NEXT_PUBLIC_DEFAULT_THEME`, `NEXT_PUBLIC_ORA_THEMES` | Initial theme and exposed light presets | Default theme is `ora-default`; additional presets are `ora-blue`, `ora-green`, `ora-purple`, `ora-orange`. Dark mode is also available. |
| `NEXT_PUBLIC_THEME_*_LABEL`, `NEXT_PUBLIC_THEME_*_COLOR` | Theme names and swatches | Optional presentation settings. |
| `NEXT_PUBLIC_DEFAULT_PROJECT_COLOR`, `NEXT_PUBLIC_DEFAULT_TEAM_COLOR` | Default entity colors | Optional presentation settings. |
| `NEXT_PUBLIC_PROJECT_COLORS`, `NEXT_PUBLIC_TEAM_COLORS` | Available project/team color palettes | Comma-separated colors. |

The database location is fixed at `prisma/ORA.db`; it is not configured through `.env`. Do not commit `.env`, database files, or custom logos. The project ignores local database files and `public/custom/` by design.

## Windows server installation

1. Obtain a trusted Ora release and run `install.cmd` as Administrator.
2. On a fresh install, choose an available TCP port when prompted (default `33333`).
3. The installer places the app under `%APPDATA%\Ora`, prepares dependencies and the SQLite database, creates or preserves `.env`, and registers `OraTimeTrackingService`.
4. Visit the URL shown by the installer and finish `/setup` if initial Owner credentials were not provisioned in advance.
5. Verify sign-in and service health, then create a backup plan.

The installer also provisions the restricted update and deletion brokers used by supported in-app operations. Repair/reinstall of an existing service preserves the configured `.env` port. Older installations may need an elevated installer repair before the in-app updater or uninstall workflow is available.

The installer manages Ora's Windows services; it does **not** configure IIS, HTTPS certificates, DNS, or firewall rules. Keep the application service bound to localhost and expose it through a properly secured reverse proxy when remote access is needed.

## Hosting behind IIS

For network access, configure IIS with URL Rewrite and Application Request Routing (ARR), enable proxying in ARR, and bind the IIS site to the intended hostname and HTTPS certificate. Example `web.config` for the default Ora port:

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

If the installer selected a different port, change the rewrite target. Set `APP_ORIGIN` to the public HTTPS URL and restart `OraTimeTrackingService`. Allow inbound connections to the proxy only; do not expose Ora's backend port directly to untrusted networks. IIS remains administrator-managed and is not installed or configured by Ora.

## Updating

For supported Windows service installations, an Owner or Admin can use the manager-only update control when a stable Ora server release is available. The external updater checks the install path, service, configured port, HTTP health, and database before staging. It migrates a copy of the database, preserves rollback material, activates the release, and checks service health afterward. The web process does not elevate itself or replace its own files.

Before updating:

- Download and verify a current database backup.
- Confirm adequate disk space and that the server is healthy.
- Do not stop the updater or Ora services during activation.

If the updater broker is missing on a legacy installation, run the elevated external updater from PowerShell:

```powershell
& "$env:APPDATA\Ora\scripts\update.ps1"
```

It detects the install path automatically. Use this only after making and verifying a backup. If preflight checks fail, resolve the reported issue before retrying; do not manually replace files while the service is running.

## Uninstalling

### In-app Owner workflow

1. Download the complete Excel archive first.
2. Open **Uninstall Ora** and choose separately whether to preserve application data and whether to create optional project/team/people inventories.
3. Type `YES` to confirm.
4. Review the status and the saved files in Documents after the operation.

The worker performs safety checks and prepares requested exports/data before removing services and application files. If a required safety check or service operation fails, it stops rather than proceeding with unsafe database removal. An older installation without the deletion broker may need an elevated installer repair first.

### Manual Windows recovery

For recovery or maintenance, `uninstall.cmd` must be run as Administrator. It asks whether to retain `.env`, the SQLite database, backups, and custom logos; optional Excel inventories are a separate choice. Ora Desktop is a separate product and must be removed separately from **Windows Settings → Apps → Installed apps**.

## Ora Desktop preview

Ora Desktop is an early Windows companion for signing in to Ora servers, saving named server profiles, and tracking time. Its desktop workflows are deliberately narrower than the web app: it does not provide Projects management, My hours, reports, backups, account administration, or other management screens. Desktop session credentials are intended to be isolated per server origin in Windows Credential Manager, and its API client is constrained to an allowlist.

> **Preview warning:** native Windows/WebView behavior, Credential Manager isolation, installer lifecycle, accessibility, and two-server interactive use have not all been verified. Do not distribute the preview as a production-ready client. See the [desktop guide](src-tauri/README.md) for safe local testing and the [release checklist](docs/desktop-release-checklist.md) for validation status. Ora Desktop is not installed or updated by the Ora server installer/updater.

## Technology stack

| Layer | Technology |
|---|---|
| Web application | Next.js 16 App Router, React 19, TypeScript 5.9 |
| Styling and UI | Tailwind CSS 4, shared theme-aware React components, Lucide icons |
| Server/API | Next.js route handlers, TypeScript, Zod validation, signed session cookies, bcryptjs password hashing |
| Persistence | SQLite at `prisma/ORA.db`; Prisma 7 with the `better-sqlite3` adapter and versioned migrations |
| Reports | ExcelJS for workbooks; fflate for ZIP exports |
| Desktop preview | Tauri 2 with Rust and a constrained web frontend/API adapter |
| Windows operations | PowerShell installer, updater, and restricted local service brokers |
| Languages | Typed English, Italian, and Spanish dictionaries |

These details describe the current implementation, not a promise that every optional desktop workflow is production-ready.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Setup page asks for a code | Locate `owner-setup-code.txt` in the application root; protect it and complete the one-time setup. If provisioning by environment, confirm both Owner variables were set before first startup. |
| Port is already in use | Choose a free port during a fresh Windows install, or update `PORT` and the reverse-proxy target consistently. Existing service repairs preserve their configured port. |
| Public URL or sign-in behaves incorrectly behind IIS | Confirm ARR proxying and URL Rewrite, set `APP_ORIGIN` to the public HTTPS origin, verify the certificate/binding, and restart the Ora service after configuration changes. |
| Update control is unavailable or fails preflight | Confirm the account is Owner/Admin, the updater broker is installed, the Windows services and HTTP health are healthy, and a verified database backup exists. Older installs may require an elevated updater/repair. |
| User cannot see a project | Check that the project is active and the user is an active project member. |
| Cannot delete a project | Projects with time-entry history cannot be deleted; archive it if permitted instead. |
| Timer start reports a conflict | Check for an already-running timer for that user and stop or review it first. |
| Ora Desktop cannot connect | Verify the server URL and network availability. Prefer HTTPS; remote HTTP requires explicit approval and is unencrypted. Desktop supports only its allowlisted API workflows. |
| SQLite backup or restore is needed | Stop the Ora Windows service first and use a verified copy. Do not overwrite a live database. |

For support requests, include the Ora version, operating system, installation type, and relevant non-secret error text. Never include passwords, `AUTH_SECRET`, session tokens, `.env`, or a real database/archive.

## Privacy and security

- Use a strong, unique `AUTH_SECRET` and restrict access to the machine, `.env`, setup code, and database.
- Use HTTPS for remote access. HTTP is unencrypted; do not expose the local app port to untrusted networks.
- Grant only the access required by each account and deactivate accounts that should no longer sign in.
- Keep Owner/Admin accounts protected and review exported records before sharing them.
- Maintain independent, verified backups and test recovery using a disposable copy.
- Keep the app and operating system updated; review release notes and backup before upgrades.
- Treat the Desktop preview as unverified for production use.

## License

Ora is distributed under the [MIT License](LICENSE).
