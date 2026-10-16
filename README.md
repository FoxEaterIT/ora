# Ora

Ora helps small teams track project hours, manage people and teams, and export reports.

## Features

- Track time on assigned projects and review personal timesheets.
- Let every active role create projects and assign multiple people; users can edit project details and assignments, while owners/admins manage teams, archive, and delete projects without time entries.
- Filter reports and export CSV or Excel files.
- Preserve time history when people are deactivated; download full SQLite backups.
- Use English, Italian, or Spanish and choose from light and dark themes.
- Prevent concurrent requests from creating multiple running timers for one user with clear conflict responses.
- Make first-owner setup completion robust and secure with proper file permissions and cleanup handling.
- Bound report exports with explicit maximum rows and columns with localized error messages when limits are exceeded.
- Add targeted regression tests for high-risk rules including authorization, setup, and concurrent timer behavior.
- Validate backup, offline restore, and migration using separate Windows SQLite database copies without touching production data.

## Stack

Next.js 15 · React 19 · TypeScript · Tailwind CSS 4 · Prisma · SQLite

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

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server with Turbopack. |
| `npm run build` | Apply pending Prisma migrations, then build for production. |
| `npm start` | Apply pending migrations, then start the production server. |
| `npm run lint` | Run ESLint. |
| `npm run check:i18n` | Check translation dictionary completeness. |
| `npx tsc --noEmit` | Run the TypeScript check. |

### Publishing a GitHub release

The local, Git-ignored `scripts/publish-release.ps1` helper can bump the patch, minor, or major version, commit the `package.json` change, push the commit and annotated tag, and publish a GitHub Release with your notes. It requires a clean branch (apart from this ignored helper) with an `origin` upstream, GitHub CLI (`gh`) authenticated, and a confirmation (`y` or `yes`, case-insensitive) before publishing. Run it from the repository root in PowerShell:

```powershell
.\scripts\publish-release.ps1 -Bump patch -Message "Fix timer conflict handling"
```

Use `-Bump minor` or `-Bump major` for those version increments. Publishing is a real remote operation; the release event triggers the GitHub Actions workflow that attaches the Windows updater ZIP. The helper refuses to write `package.json` unless the bumped file is still valid JSON and its `version` field matches the new tag. If a network or GitHub error occurs mid-publish, inspect Git status, tags, and Releases before retrying.

> **Do not install v0.2.0 or v0.2.1.** Their published `package.json` is not valid JSON (`$10.2.0"` / `$10.2.1"` instead of `"version"`), so the archive workflow failed and those releases have no updater ZIP. The local helper that caused it is fixed. Install from this source with elevated `install.cmd`, then publish a newer release only after the working tree is committed and the archive workflow attaches `ora-v<version>.zip`.

Run `npm test` to execute the automated regression tests.

## Project structure

```text
src/
  app/          Pages and API route handlers
  components/   Shared interface components
  i18n/         English, Italian, and Spanish dictionaries
  lib/          Authentication, configuration, and data helpers
prisma/         SQLite schema and versioned migrations
scripts/        Windows install, update, and uninstall scripts
docs/readme/    README illustrations
```

## Windows installation and hosting

Run `install.cmd` as Administrator on Windows. It installs the production app under `%APPDATA%\Ora`, initializes the SQLite database, and registers the `OraTimeTrackingService` Windows service. Then visit `http://localhost:33333` and complete `/setup`.

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

Create an IIS site using that folder and bind the intended hostname and HTTPS certificate. Set `APP_ORIGIN` to the public URL, restart `OraTimeTrackingService`, and allow inbound traffic only to the proxy. The example assumes the default Ora port.

### Updating Ora

`install.cmd` registers a second Windows service, `OraTrackingServiceUpdater`. This broker service runs under a privileged account and accepts only fixed, locally-scoped update commands through a restricted named pipe (`OraTrackingServiceUpdater`). It cannot execute arbitrary commands, paths, or remote requests; the application path and status file are fixed at install time.

When a release is available, an owner or admin sees an **Install update** button in the Shell header. Selecting it requests an update through `POST /api/update`; the web app never replaces its own files or stops its own service. The broker invokes the external updater (`scripts/update.ps1`), which stages a verified release copy, applies Prisma migrations to a copied database, then — during a brief outage — swaps files and restarts `OraTimeTrackingService` with rollback and backup retention intact. After Ora is healthy again, the updater provisions or refreshes `OraTrackingServiceUpdater` from the verified release scripts. Older installations without the auxiliary service are therefore enrolled as part of an update; the service's durable status under `%ProgramData%\\Ora` is preserved.

> **Legacy installation without the updater service:** the in-app update trigger cannot reach a broker that is not installed. Run the external updater from an elevated PowerShell session. It automatically detects the Ora installation at `%APPDATA%\Ora` or from the running `OraTimeTrackingService` working directory, so no path argument is required. For example: `& "$env:APPDATA\Ora\scripts\update.ps1"`. The updater installs or refreshes `OraTrackingServiceUpdater` after a newer app release has been activated and `OraTimeTrackingService` is healthy. If no newer release exists, no service bootstrap occurs; install/update Ora to a newer release first. Do not run this against a production installation without a verified database backup and the normal maintenance precautions.

While an update is in progress, the Shell polls `GET /api/update`, tolerates the temporary service interruption, and reports coarse phases (`queued`, `downloading`, `verifying`, `building`, `stopping`, `migrating`, `activating`, `restarting`, `succeeded`, `failed`) without exposing internal command output. Once the service is healthy again at the new version, the notice clears.

> **Safety:** the web process cannot elevate itself. The update can only proceed while `OraTrackingServiceUpdater` is running with an account authorized to stop `OraTimeTrackingService` and manage the install directory. If the broker or update status is unavailable, the install/update button is disabled and the Shell reports that the updater service is unavailable.

## Contributing

See [AGENTS.md](./AGENTS.md) for development conventions. No separate contribution guide is present.

## License

[MIT](./LICENSE).

## Roadmap

### Priority 0

- [x] Prevent concurrent requests from creating multiple running timers for one user with a SQLite partial unique index and localized HTTP 409 conflict response; `tests/timer-concurrency.test.ts` exercises concurrent inserts.
- [x] Make first-owner setup cleanup safe after owner commit; cleanup failure is ignored, and the setup-code file is created with best-effort `0600` permissions. Automated tests cover cleanup failure, code verification/removal, and POSIX file permissions. On Windows, restrict access to the app directory using its service account ACL.
- [x] Bound report exports to 10,000 rows and 10 columns with localized errors; `tests/export-limits.test.ts` checks boundary decisions and verifies CSV, multi-file ZIP, and XLSX response bodies and media types without a database.
- [x] Add targeted regression tests for manager-role policy and export API authorization outcomes (401 anonymous, 403 standard user, allowed manager), as well as setup-code lifecycle and timer concurrency.
- [x] Validate backup, restore, and the pending migration using copies of the installed SQLite database; all write operations stayed within `%TEMP%\\Ora-validation-20261014-173110`, never the installed `ORA.db`.
  - [x] The baseline copy passed `PRAGMA integrity_check;`; all three recorded migrations were finished.
  - [x] Applied the pending timer-index migration to a separate workspace copy; it passed integrity check, recorded four finished migrations, and created the expected partial unique index.
  - [x] Restored a separate baseline copy; integrity passed and its SHA-256 matched the baseline.
  - [x] Smoke-tested the cloned app on a distinct port with synthetic ADMIN login, `/api/me`, and manager SQLite backup download; the downloaded snapshot passed integrity check and included the synthetic time entry.
  - [x] Exercise authenticated report CSV/XLSX routes on the cloned app; both returned HTTP 200 with the expected content types.
  - [x] Restore the downloaded snapshot into a second isolated app clone; integrity passed and restored app page, synthetic login, `/api/me`, and CSV export all returned HTTP 200.
  - [x] Exercise authenticated report CSV/XLSX routes on the cloned app; both returned HTTP 200 with expected content types.
  - [x] Smoke-test the isolated app clone on `127.0.0.1:33334`: login page returned HTTP 200, `/api/setup` reported setup complete, malformed login returned 400, and anonymous backup request returned 401. The clone used a copied database and config; no installed data was changed.
  - [x] Publish updater target `v0.1.1`; release archive workflow succeeded and attached `ora-v0.1.1.zip` with SHA-256 `4029ce98e1fc4b09a4cdbc63da740687db68e7f284cd2677fc0ed2ea91e30a9d`.
  - [x] Run updater preflight/build against the installed source: checksum, install, Prisma generation, and production build passed; service stop was denied because session was not elevated. Service stayed Running, install remained at `0.1.0`, and database/backup files were not changed. Actual activation remains pending an elevated session.
  - [x] Verify synthetic ADMIN sign-in (`/api/auth/login` and `/api/me`) and manager-only SQLite snapshot export (`/api/backups`, HTTP 200, 90,112 bytes). The downloaded snapshot passed `PRAGMA integrity_check` and contained two users plus one synthetic time entry. Test servers were stopped; no persistent test service was installed.
  - [ ] Exercise the actual Windows service updater flow against a dedicated disposable service installation; the installed service was intentionally not stopped or altered.

> **Validation record (2026-10-14):** Used `%TEMP%\\Ora-validation-20261014-173110`. The read-only online-backup baseline passed `PRAGMA integrity_check` and had three finished migrations. Applying the pending timer-uniqueness migration to a copied workspace succeeded, passed integrity checks, recorded four finished migrations, and created `TimeEntry_one_running_per_user_key`. Restoring a separate baseline copy with SQLite’s backup API passed integrity checks and matched the baseline SHA-256. The cloned app built and ran on port `33334`; synthetic ADMIN login and `/api/me` succeeded. The manager-only `/api/backups` endpoint returned a 90,112-byte SQLite snapshot containing the synthetic row; that snapshot passed `PRAGMA integrity_check`. Authenticated report CSV and XLSX routes both returned HTTP 200 with expected media types on the clone. Restoring the downloaded snapshot into a second app clone preserved integrity; restored app login page, synthetic ADMIN login, `/api/me`, and CSV report export all returned HTTP 200. The installed service remained Running and was never redirected, stopped, or reconfigured. The actual Windows service updater flow remains untested.

> **Safe Windows validation:** Use a clearly named test directory outside the installation. This validation used an online SQLite backup from the installed DB while opening its source read-only, then ran integrity checks, migration, and restore only on temp copies; the installed service remained untouched. Future service/update-flow tests should use synthetic data or isolated copies only. Stop only a disposable test service if quiescing its test database; never stop or reconfigure the installed service for testing. Run `npx prisma migrate deploy` only from a disposable workspace with `file:./ORA.db` resolving to its test DB. Restore to another test path and run only the test app on a confirmed distinct port. Never point the installed service at test files or replace its `ORA.db`. Verify hashes, integrity, and test-only sign-in/exports before cleaning the clearly labeled temp directory.
