# Ora Priority 0 Implementation Plan

> **For agentic workers:** Execute one workstream at a time with test-first changes and verification; keep this checklist updated.

**Goal:** Complete Ora’s five Priority 0 workstreams: timer concurrency, owner setup hardening, bounded exports, regression tests, and safe Windows-copy validation.

**Architecture:** Preserve Next.js route-handler, Prisma/SQLite, and typed-i18n patterns. Add only the smallest test infrastructure needed, and keep any database experiment isolated from production.

**Tech Stack:** Next.js 15, TypeScript, Prisma 6, SQLite, npm; test runner to be selected after inspecting current dependency constraints.

**Spec:** User-approved Priority 0 checklist in the conversation and the current roadmap in `README.md`/`AGENTS.md`.

## Global Constraints

- Work in the existing workspace; preserve the user’s current uncommitted README.md and AGENTS.md changes.
- Do not add direct `process.env` use outside configuration modules.
- User-facing errors must be added to English, Italian, and Spanish dictionaries and pass `npm run check:i18n`.
- Keep authorization checks in route handlers; UI hiding is not security.
- Never touch or restore over a production database; Windows tests use a separate copy only.
- Update both `README.md` and `AGENTS.md` for each implementation step and record history.

## Review Focus

- Two timer requests arriving together must not both create an active entry; one succeeds and the other receives HTTP 409.
- Completed setup must not be reported as failed because deleting its consumed code file failed.
- Setup code must be created with restrictive permissions where supported and must not leak via response/logging.
- Export caps must be checked before loading/materializing the full export; exact cap accepted, cap+1 rejected in all formats.
- Repeated and unauthorized setup/export/timer requests must not bypass authorization or one-time rules.
- Windows validation must stop if the isolated copy cannot be positively identified; no production path may be used.

---

### Execution ledger

- Ruling: Continue in the user-approved existing workspace on `main` — the user explicitly chose the current folder; no worktree has been created — cost if wrong: changes are made directly on the shared branch rather than isolated.
- Ruling: Do not use the standard SDD scratch workspace — `.superpowers/` is not ignored and would require unrelated `.gitignore` changes; preserve current workspace state and track progress here instead — cost if wrong: less isolated progress bookkeeping.

### Workstream 1: Concurrent active timers

**Files:** `src/app/api/entries/route.ts`; likely a new migration if the chosen SQLite-supported invariant requires it; test files and `package.json` if test setup is needed; `src/i18n/messages.ts`; `README.md`; `AGENTS.md`.

- [ ] Trace all timer creation and update paths, current unique/index constraints, and Prisma/SQLite transaction semantics.
- [ ] Add a concurrency regression test that launches two active-entry creates for the same user and asserts exactly one succeeds and one conflicts.
- [ ] Run the test and verify it fails against current behavior.
- [ ] Implement the smallest cross-process-safe atomic strategy. Do not rely on an in-memory mutex for a multi-process service.
- [ ] Return a localized 409 conflict if another active timer already exists, including database-conflict handling if needed.
- [ ] Run targeted test, full test suite, `npx tsc --noEmit`, `npm run lint`, and `npm run check:i18n`.
- [ ] Update user/developer docs and history.

### Workstream 2: Owner setup robustness

**Files:** `src/app/api/setup/route.ts`; `src/lib/setup-code.ts`; test files; `README.md`; `AGENTS.md`.

- [ ] Trace all callers of setup-code creation, verification, and removal, and the sequence after the owner update commits.
- [ ] Add tests for successful setup, repeated setup, and cleanup failure; verify tests fail where the behavior is missing.
- [ ] Make cleanup best-effort only after the owner account is committed and session established so the API does not report a false failure.
- [ ] Set restrictive permissions at creation on supported platforms (private file mode); review containing-directory security and document platform limits without changing global directory permissions blindly.
- [ ] Verify setup code is consumed/unusable after successful setup even if the file remains, because the database state rejects repeat setup.
- [ ] Run targeted/full tests and project checks; update docs/history.

### Workstream 3: Bounded report exports

**Files:** `src/app/api/export/route.ts`; `src/i18n/messages.ts`; report UI under `src/app/(app)/manage/report/`; test files; `README.md`; `AGENTS.md`.

- [ ] Inspect report UI column selection and response behavior; choose and document explicit limits. Proposed implementation defaults: 10,000 rows and the existing 10-column whitelist as the maximum (no new configurable settings).
- [ ] Add tests for at-cap and cap+1 rows and columns, including empty results and CSV, ZIP, and Excel responses.
- [ ] Query at most `MAX_EXPORT_ROWS + 1` records, reject overflow before transforming/grouping/serializing, and return a localized actionable error.
- [ ] Enforce the column maximum at request validation; keep column keys limited to the existing whitelist.
- [ ] Add visible limit guidance to the report UI if the API error alone would be unclear.
- [ ] Run targeted/full tests, TypeScript, lint, and i18n checks; update docs/history.

### Workstream 4: Authorization and regression coverage

**Files:** test setup and targeted API tests; `package.json`; potentially route handlers only if tests reveal regressions; `README.md`; `AGENTS.md`.

- [ ] Reuse tests from timer and setup workstreams; do not duplicate identical behavior tests.
- [ ] Add focused tests for manager-only exports/backups and owner-only management actions, plus standard-user entry ownership restrictions.
- [ ] Use real SQLite behavior where practical; mock only external boundaries such as session/auth context where necessary.
- [ ] Add the smallest test command to `package.json`; run the entire suite and existing project checks.
- [ ] Document test command and update history.

### Workstream 5: Windows backup, restore, and migration validation

**Files:** likely README procedure/checklist and `AGENTS.md` history; no production DB files.

- [ ] Ask for or identify a separate copy of the Windows installation database; verify its full path is distinct from the production database before any operation.
- [ ] Run `PRAGMA integrity_check;` against the copy and save the result.
- [ ] Test backup and offline restore using only the separate copy and the documented stopped-service procedure.
- [ ] Apply the deactivation migration to the copy and verify historical rows, login, reports, and expected FK/deactivation behavior.
- [ ] Verify service/IIS behavior only in a non-production test installation; record any parts requiring administrator/user execution as pending rather than claiming success.
- [ ] Update docs/history with actual evidence and remaining environment-specific steps.

## Decisions and open values

- Export limits are proposed as 10,000 rows and 10 columns (the latter is the current field whitelist size); validate suitability during implementation and state the exact user-visible limit.
- SQLite partial unique index feasibility and Prisma migration compatibility must be checked before choosing the concurrency invariant; prefer a database-level guarantee over process-local locking.
- No automated test runner is currently declared in `package.json`; select the lightest viable option after checking Next route testing support and repository constraints.
