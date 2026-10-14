# Ora

Ora helps small teams track project hours, manage people and teams, and export reports.

## Features

- Track time on assigned projects and review personal timesheets.
- Manage people, teams, roles, and project assignments.
- Filter reports and export CSV or Excel files.
- Preserve time history when people are deactivated; download full SQLite backups.
- Use English, Italian, or Spanish and choose from light and dark themes.

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

There is no automated test script configured in `package.json`.

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

## Contributing

See [AGENTS.md](./AGENTS.md) for development conventions. No separate contribution guide is present.

## License

[MIT](./LICENSE).
