# Ora — Time tracking

Ora is a web application for tracking time spent on projects and activities, organizing people and teams, and viewing exportable reports. It is designed for small teams that want to track hours through a simple interface with distinct roles.

## Technology

- **Next.js 15** and **React 19** for the web app and APIs.
- **TypeScript** for type safety.
- **Tailwind CSS 4** for styling, with CSS variables for themes and components.
- **Prisma** with **SQLite** for the database.
- **Bcrypt** for password hashing and signed cookies for sessions.
- **ExcelJS** for generating Excel files.

## Features

- Timer and time entry for assigned projects.
- Personal timesheet and reports for administrators.
- Management of users, roles, teams, projects, and assignments.
- Account activation on first access: users set a password and use it for subsequent logins.
- CSV and Excel report export with selectable grouping (team, project, or user), combinable filters, selectable columns, and per-item grouping.
- Light themes: **Ora - default**, **Ora blue**, **Ora green**, **Ora purple**, **Ora orange**. The selected light theme is retained when switching to dark mode. Dark mode uses a single preset.
- Modernized, theme-consistent input controls: fields with focus states, styled selects, custom checkboxes, and native date pickers integrated with the palette.
- Fixed header with side navigation menu, theme settings, and account menu.
- Configurable branding through `.env`: app name, separate light/dark logos, and selection of available light themes (the default theme is always available).

## Roles

| Role | How it is assigned | Main permissions |
|---|---|---|
| Owner | Created at first launch using `OWNER_EMAIL` and `OWNER_PASSWORD` in `.env`; afterwards, email and password are managed from the My Account page. | One owner per installation; full access and can promote users to admin. |
| Admin | Assigned by the owner on the People page. | Manages people, teams, projects, and reports. |
| User | Created by an owner or admin with name, email, role, and team. | Logs and views their hours on projects assigned directly or through a team. |

## Quick user guide

### Sign in

1. Open the app address and enter your email.
2. On first access, set and confirm the requested password.
3. For subsequent access, sign in with your email and password.

The owner is created on first access using `OWNER_EMAIL` and `OWNER_PASSWORD` in `.env` (example values are `owner@ora.local` and `changeme`: replace these before exposing the app). Changing these variables after account creation does not change the existing account credentials. Use **My Account** in the account menu to change them, confirming the current password. Data and role remain associated with the same account.

### Navigation

The header remains at the top as you navigate. The menu button on the left opens the side panel with sections available for the current role: Timer, My Hours and, for owners/admins, Reports, Projects, Teams, and People.

### Appearance and account

- The palette icon appears only in light mode and lets you choose an Ora preset.
- The sun/moon icon switches between light and dark modes. Switching back to light restores the selected light preset.
- The account menu shows name, email, and role, allows sign-out, and provides access to **My Account**. Every user can change their own password after verifying the current one; only the owner can change email addresses and passwords for all accounts from the People page. The owner can also force a password reset for another account: its password hash is cleared, and the user must set a new password on next sign-in.
- Theme preferences are saved in the current browser.

### Time tracking and management

- **Timer**: start and stop the timer by selecting an available project/activity.
- **My Hours**: view personal time entries.
- **People**, **Teams**, **Projects**: available to owners/admins to configure the organization and assignments.
- **Reports**: available to owners/admins to view and export data. Choose a grouping (project, team, or user), combine date, team, project, and multi-person filters; different filter types are combined with AND, while values within the same filter are combined with OR. An entry matching multiple criteria appears only once. You can choose columns; CSV downloads a single file for one item or a ZIP with separate CSV files for multiple items. Excel creates one worksheet per item, with names adjusted to Excel's limits.

## Installation and development

Prerequisites: Node.js and npm.

```bash
npm install
npm run dev
```

Create `.env` from `.env.example`. For initial setup, you can leave `OWNER_EMAIL` and `OWNER_PASSWORD` empty: on first startup, a temporary owner without a password is created and `owner-setup-code.txt` is generated in the app directory. Read the code on the server and enter it at `/setup` along with an email and password; the file is deleted when setup completes. The file is excluded from Git but has no special permissions: protect access to it according to server policies. Alternatively, configure both owner variables to provision the owner with those credentials. In production, set a random `AUTH_SECRET` and do not use placeholder values; startup rejects placeholders and requires either both owner variables or neither.

With SQLite, the default `DATABASE_URL` is `file:./dev.db`, which Prisma resolves as `prisma/dev.db`. SQLite is suitable for a single machine as long as the file is stored on persistent storage; the local database is excluded from Git. Versioned migrations create an empty schema. For deployment on a single machine, apply migrations with `npx prisma migrate deploy`, then start with `npm start`. Do not share or commit database files or dumps.

Open [http://localhost:3000](http://localhost:3000).

### Branding and themes through `.env`

Copy `.env.example` to `.env` and customize:

- `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TAGLINE`, `NEXT_PUBLIC_APP_DESCRIPTION`: app name, tagline, and description/metadata.
- `NEXT_PUBLIC_DEFAULT_THEME`: initial light theme (default `ora-default`; must be one of the available themes).
- `NEXT_PUBLIC_THEME_<DEFAULT|BLUE|GREEN|PURPLE|ORANGE>_LABEL` and `_COLOR`: label and swatch color for each theme.
- `NEXT_PUBLIC_PROJECT_COLORS`, `NEXT_PUBLIC_TEAM_COLORS`, `NEXT_PUBLIC_DEFAULT_PROJECT_COLOR`, and `NEXT_PUBLIC_DEFAULT_TEAM_COLOR`: UI palettes and default colors for new projects/teams.
- `SESSION_COOKIE_NAME`, `SESSION_DURATION_DAYS` (integer 1–365), and `PASSWORD_HASH_ROUNDS` (integer 10–15): session and password hashing settings; invalid numeric values cause an explicit error.
- `APP_ORIGIN`: public base URL of the installation.
- `NEXT_PUBLIC_APP_LOGO_LIGHT` and `NEXT_PUBLIC_APP_LOGO_DARK`: paths to custom logos located only in `public/custom`, for example `/custom/logo-light.svg`. External URLs and paths in other folders are rejected. If only one is configured, it is used in both modes; without custom logos, the current text brand is shown. `public/custom/` is excluded from Git: add the logo files there in each installation.
- `NEXT_PUBLIC_ORA_THEMES`: comma-separated list of additional light themes to offer, selected from `ora-blue`, `ora-green`, `ora-purple`, and `ora-orange`. `ora-default` is always shown and should not be specified. If the variable is absent or empty, all themes are available.

Because these are `NEXT_PUBLIC_*` variables, their values are embedded in the bundle: set them before starting/building the app and rebuild after every change. Logos must be placed only in `public/custom/` and referenced with a `/custom/...` path.

## Useful commands

```bash
npm run dev       # development server
npm run lint      # ESLint checks
npx tsc --noEmit  # TypeScript check
npm run build     # production build
```

## Report exports

On the Reports page, owners and admins can choose how to group output by **project** (default), **team**, or **user**. Date, team, project, and people filters can be combined: different filter types are applied together (AND), while multiple selections within the same filter match any selected value (OR). Each entry is exported only once. The report and export files use the same complete selection; dates filter by start time and the end date is inclusive.

Columns can be configured with checkboxes for date, person, email, team, project, activity, start, end, duration, and note. Report UI and downloaded CSV/Excel content, including column headers and generated worksheet/file labels, follow the selected application language (English, Italian, or Spanish). CSV produces a single file when the grouping contains one item, or a ZIP archive with one CSV per item when there are multiple items. Excel creates one worksheet per item; duplicate names are made unique and long names are shortened to comply with Excel limits. Rows are sorted by start time in ascending order.

## Languages

The interface, initial account setup and login pages, and report exports are available in English, Italian, and Spanish. On first use, Ora selects the first supported language in the browser preferences, falling back to English. The choice is saved in the browser under `ora-locale`; users can change it at any time from the language selector in the header. Adding another translation currently requires adding a typed dictionary to `src/i18n/messages.ts`; in-app translation editing is a possible later enhancement.

## Roles and preferences

Owners and admins can view reports and export data for all people; standard users see only their own entries and cannot access management features. Selected themes are stored in the browser and persist after sign-out/sign-in and while navigating; they are not associated with the account.

## Roadmap

- Add automated regression tests for exports, authorization, and theme persistence; consider additional sorting and formatting options.
- Desktop app through Tauri.
- Jira integration to link projects and issues and, eventually, synchronize worklogs.

See [AGENTS.md](./AGENTS.md) for development conventions and agent-specific guidance.
