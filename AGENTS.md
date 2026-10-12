# Agent instructions — Ora

This document provides context and conventions for agents modifying the project. User and harness instructions take precedence.

## Purpose and stack

Ora is a time-tracking app for projects, teams, and people. Stack: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Prisma/SQLite. APIs are route handlers under `src/app/api`; authentication uses bcryptjs passwords and signed session cookies. Excel files are generated with ExcelJS.

## Structure

- `src/app/(app)/`: protected app pages (timer, timesheet, and management).
- `src/app/api/`: API route handlers; `api/export/route.ts` handles filters, CSV ZIP/Excel multi-sheet grouping, and export columns.
- `src/components/shell.tsx`: shared authenticated layout, header, side panel, and theme controls.
- `src/components/ui.tsx`: shared UI components (`Input`, `Select`, `Checkbox`, `Textarea`, buttons, cards, and headers). Date inputs use the native date picker, themed through CSS `color-scheme`.
- `src/app/globals.css`: design tokens and theme presets.
- `src/lib/app-config.ts` and `src/lib/server-config.ts`: centralized access to public and server-side configuration defined in `.env`; `.env.example` documents the keys. Avoid direct `process.env` access elsewhere.
- `src/i18n/messages.ts` contains the typed English, Italian, and Spanish dictionaries, locale normalization, and English fallback. `src/i18n/provider.tsx` resolves browser preference on initial client mount and persists the selection in `ora-locale`; add translations to every dictionary and run `npm run check:i18n`.
- `src/lib/`: auth, access control, Prisma, and domain utilities. Initial owner setup is in `src/app/setup/` and `/api/setup`; when owner credentials are not configured, `ensureOwner` creates a temporary account without a password and generates `owner-setup-code.txt` in the app root, which is consumed and removed by the one-time setup flow.
- `prisma/schema.prisma`: data model; migrations are in `prisma/migrations/`. Local SQLite databases (`prisma/*.db`, journal files, and SQLite variants) are excluded from Git; an empty schema is created by applying versioned migrations.
- `install.cmd` and `scripts/install.ps1`: Windows installer for a downloaded copy. It installs the app under `%APPDATA%\Ora`, ensures Node.js 20+, runs `npm install`, creates `.env` from `.env.example` with a random `AUTH_SECRET` only when `.env` is missing, then runs `prisma generate` and `prisma migrate deploy`. Default port is `33333`; default relative SQLite database is kept in the installation's `prisma` directory. It does not currently build production assets, register a Windows service, or configure IIS. Deployment and process hosting are administrator-managed and documented in README, including generic reverse-proxy guidance and the IIS/ARR setup outline. Do not add IIS or service management to the installer unless explicitly requested. It must not overwrite an existing `.env` or embed owner credentials. An absolute `DATABASE_URL` remains the installer's responsibility to provision.
- `README.md`: user and product documentation; keep it up to date. Keep the production hosting and reverse-proxy guidance accurate while leaving Windows service and IIS configuration to end users/administrators. From this point through the end of the project, keep it modern, scannable, and visual using **pure Markdown** plus local images: a short intro, a jump list, GitHub-style tables, blockquote callouts, fenced code, and colored cards. Color belongs in image files under `docs/readme/` (SVG), referenced with Markdown image syntax such as `![Track](docs/readme/track.svg)`. Do not use raw HTML (`<table>`, `<td>`, `<p align>`, `<img>`, `<br>`, `<div>`): the in-app viewer prints those tags as text. Do not revert it to long unbroken prose. Preserve accuracy when restyling; user-facing facts stay in the README, developer conventions stay here.

## Development conventions

- Keep TypeScript strict and follow existing App Router patterns.
- Preserve roles and authorization checks in APIs: hiding a UI item is not a security control.
- For Prisma schema changes, add a new migration and do not modify migrations that may already have been applied. Check whether the client needs to be regenerated.
- Keep the UI consistent with CSS variables (`--bg`, `--surface`, `--ink`, `--muted`, `--line`, `--brand`, `--good`, `--warn`, `--danger`, etc.); avoid hardcoded surface and text colors where they should adapt to themes.
- Light presets are `ora-default`, `ora-blue`, `ora-green`, `ora-purple`, and `ora-orange`; `dark` is a single theme. `NEXT_PUBLIC_ORA_THEMES` controls which additional presets are exposed, while `ora-default` is always allowed. Validation and UI use the same list from `src/lib/app-config.ts`. The active theme is applied on `html[data-theme]`; preferences are stored in localStorage (`ora-theme`, `ora-light-theme`).
- `.env` is the central source of runtime/build configuration; add every new option here and document its key in `.env.example`. Settings exposed to the client must use `NEXT_PUBLIC_*` and are embedded in the bundle. Avoid parallel hardcoded configuration in application files.
- `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_TAGLINE`, `NEXT_PUBLIC_APP_DESCRIPTION`, `NEXT_PUBLIC_APP_LOGO_LIGHT`, and `NEXT_PUBLIC_APP_LOGO_DARK` configure branding. Custom logos must be placed only in `public/custom/`, which is ignored by Git; configure only `/custom/...` paths (never URLs or other paths). If only one logo is set, it is used for both modes.
- The global header and side panel are in `Shell`. Management links are restricted to owner/admin.
- Avoid destructive data changes and do not overwrite unrelated work.
- Do not claim a development server is running or verified unless you have checked it; respect user requests not to check or restart it.
- All comments and developer-facing documentation, including this file, must be written in English. User-facing text belongs in the typed dictionaries in `src/i18n/messages.ts`; do not add new hardcoded interface strings.

## Report exports

- UI: `src/app/(app)/manage/report/page.tsx`; endpoint: `src/app/api/export/route.ts`.
- Repeated `userId`, `projectId`, and `teamId` parameters are deduplicated server-side. Different filters intersect (AND), values within one filter are combined (OR); the query has no row limit and returns each entry once. Entries API requests for USER remain constrained to `me.id`; export is restricted to OWNER/ADMIN.
- Date filters use the start timestamp; the UI includes the full final date through the last millisecond.
- `focus` determines grouping by `project`, `team`, or `user`; repeated `column` parameters are validated against the `FIELDS` whitelist.
- CSV: a single item is returned as CSV, multiple items as a ZIP containing separate CSV files (fflate). Excel: one worksheet per item, with unique names limited to 31 characters.
- Report UI and exported CSV/Excel labels, fallback values, date/number formats, and validation messages are localized according to the validated `locale` query parameter; internal column keys remain stable. Update README and the history when export behavior changes.

## Roles and themes

- Report/export APIs require a manager (`isManager`); entries queries always force `userId: me.id` for standard users.
- `ora-theme` and `ora-light-theme` preferences live in localStorage, persist after logout, and are validated against supported presets in the layout and Shell.
- There is one OWNER per installation: `ensureOwner` uses `.env` credentials only during initial provisioning and repairs legacy duplicate owners by demoting subsequent accounts to ADMIN. Any authenticated user can change their own password through `PATCH /api/account` after verifying the current password; only OWNER can change other users' email addresses and force password resets through `PATCH /api/users/[id]`. A reset sets `passwordHash` to `null` to allow the first-access flow; always protect the OWNER account.

## Checks

Run as appropriate after changes:

```bash
npx tsc --noEmit
npm run lint
```

For database changes, review migrations and follow the user's instructions before applying them to an existing database.

## Documentation maintenance and roadmap

For each implementation change, update **both `README.md`** (user guide, features, and user-facing roadmap) **and this `AGENTS.md`** (structure, conventions, or relevant development notes). If a change does not affect their content, confirm that both documents remain accurate; still update at least the history section below to maintain the ongoing record.

When updating `README.md`, follow the presentation rule in **Structure**: pure Markdown, a short intro, jump links, tables, blockquote callouts, and colored cards stored as SVG in `docs/readme/`. Never insert raw HTML. Keep existing card art in sync when those summaries change. New user-facing behavior goes into the matching section (or a new one in the same style), not into a wall of paragraphs. Keep the document in English.

### Status / history

- 2026-10-12: defined Ora light presets (default, blue, green, purple, orange), one dark theme, and header theme selection.
- 2026-10-12: added persistent header, navigation side panel, and account menu; removed navigation from the fixed side column.
- 2026-10-12: added project/team/user export grouping, combinable filters and multi-select, customizable columns, single CSV or per-item ZIP, and per-item Excel worksheets; query naturally deduplicates entries and worksheet names are unique and limited in length.
- 2026-10-12: updated shared inputs/selects, added themed checkboxes, and applied shared controls to the sign-in screen.
- 2026-10-12: centralized application configuration in `.env`/`.env.example`: branding, theme defaults and availability, palettes, initial colors, app origin, session, password hashing, and initial owner credentials; `process.env` access is limited to configuration modules (except platform variables managed by Next/Prisma).
- 2026-10-12: added owner self-service email/password management with current-password verification and enforcement of a single OWNER, including repair of legacy duplicates.
- 2026-10-12: restricted custom logos to `public/custom/`, excluded it from Git, and rejected other paths and external URLs in configuration.
- 2026-10-12: excluded local SQLite databases and journals from Git; added versioned migrations for an empty database. Deployment target: a single instance on a machine with persistent SQLite storage.
- 2026-10-12: added one-time owner onboarding with a file-based random code; production rejects placeholder secrets and validates numeric session/hash settings.
- 2026-10-12: translated project comments and developer/user documentation to English.
- 2026-10-12: added English, Italian, and Spanish typed dictionaries, browser-language detection with English fallback, a persistent language selector, and locale-aware report UI and CSV/Excel exports.
- 2026-10-12: localized timer, timesheet, account, people, teams, projects, login, setup, and shell navigation in all three dictionaries. API error responses remain Italian pending a request-locale convention.
- 2026-10-12: restyled `README.md` into a scannable layout of Markdown tables, callouts, and colored SVG cards in `docs/readme/`. Raw HTML is not allowed, because the project viewer shows those tags as text. That presentation is required for every future README update through the end of the project.
- 2026-10-12: added a Windows installer that copies the app under `%APPDATA%\Ora`, ensures Node.js (via winget when missing), installs npm packages, creates a non-destructive `.env`, initializes SQLite under the app data folder by default, and supports a configurable `PORT` (default `33333`).
- Current product roadmap: validate exports with large datasets and edge cases; add a signed, packaged desktop installer for broader platforms; Tauri and Jira are possible later phases.
