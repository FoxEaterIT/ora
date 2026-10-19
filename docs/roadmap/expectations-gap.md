# Ora Expectations Gap — Development Checklist

This checklist tracks the user-requested behavior that differs from the current implementation. Keep each item open until its implementation, authorization, UI, documentation, and focused tests are complete.

## 1. Project permissions and lifecycle

- [x] Allow all authenticated active roles (`OWNER`, `ADMIN`, `USER`) to create projects, while retaining validation and safe membership defaults.
- [x] Allow `USER` roles to edit project metadata and assign/unassign themselves; prevent them from managing other users' assignments, teams, archive state, or project deletion.
- [x] Allow only Owner/Admin to delete projects, and only when they have zero time entries; retain database-level `RESTRICT` protection for projects with entries.
- [x] Return localized errors for project-not-found and project-has-time-history cases.
- [x] Expose the project page to normal users, with create/edit/self-assignment controls; retain manager-only archive, other-member assignment, and deletion controls.
- [ ] Test API role matrix, deletion with/without entries, and direct database foreign-key protection.

## 2. Time-entry deletion

- [x] Allow a standard user to delete their own time entries; deny deletion of another user's entries.
- [x] Enforce that Owner/Admin may delete only their own entries, matching the stated user-ownership rule.
- [x] Add a localized confirmation and deletion feedback to the timesheet UI.
- [x] Preserve editing of start/end and existing entry ownership rules.
- [x] Test owner, admin, and user authorization policy and disposable SQLite deletion/readback behavior. Report visibility follows the shared TimeEntry table query; project-deletion history remains enforced by the existing foreign-key restriction.

## 3. Full-data Excel backup — Owner only

- [x] Change `/api/backups` authorization from manager-only to Owner-only and hide the page/link for Admin.
- [x] Generate three Excel workbooks: one for projects, one for people, and one for teams.
- [x] In each workbook, create worksheets for each corresponding entity with validated unique worksheet names within Excel's 31-character limit.
- [x] Include entity metadata and related time entries with person/team/project identity fields.
- [x] Package the three workbooks into one ZIP download and label the UI action as a complete Excel backup, distinct from a raw SQLite snapshot.
- [x] Retain no in-app SQLite snapshot in this action; the existing offline/administrator database backup and restore guidance remains documented separately.
- [x] Test Owner-only policy (anonymous 401, USER/ADMIN 403), empty datasets, workbook/sheet counts, related time-entry completeness, safe unique sheet names, and ZIP contents. Route smoke tests against a running authenticated application remain deployment validation.

## 4. Installer: interactive port selection and collision handling

- [x] Prompt for a valid TCP port during fresh installation, defaulting to configured value or `33333`; preserve `.env` `PORT` when the Ora service is already registered.
- [x] Check whether the selected port is already bound before writing fresh-install configuration or registering services.
- [x] On collision or invalid input, explain the issue and prompt again; allow explicit cancellation.
- [x] Persist the accepted new-install port to `.env` and use that value in service configuration and final URL.
- [ ] Test port prompt edge cases, repair/reinstall preservation, and `.env`/WinSW/URL consistency on a disposable Windows installation.
- [x] Preflight the external updater against existing install path, services, WinSW configuration, configured port/listener, HTTP health, and database presence; after stopping the runner check lingering processes and SQLite sidecars, hash-check database copies, optionally run SQLite integrity checks when `sqlite3.exe` exists, and verify HTTP health after activation.
- [ ] Exercise the complete updater flow with a disposable Windows service installation.

## 5. Windows service topology and installation path

- [ ] Install the application under the requested `%APPDATA%\Roaming\ORA` location, handling Windows' actual `APPDATA` path consistently and documenting the canonical folder.
- [ ] Register exactly the requested services: `OraTimeTrackingService`, `OraTimeTrackingUpdater`, and `OraTimeTrackingDeletion`; resolve migration/compatibility behavior for existing `OraTrackingServiceUpdater` installations.
- [ ] Use verified/trusted WinSW binaries and generated service XML; pin service executable paths and least-privilege identities where possible.
- [ ] Ensure fresh installation rolls back partial service registration and files safely if a later step fails.
- [ ] Test service names, binary/config paths, startup modes, failure recovery, idempotent install, and cleanup on a disposable Windows installation.

## 6. In-app deletion service and complete uninstall

- [ ] Add a manager-only (Owner-only if following the stated full-control boundary) web action that sends a fixed uninstall request to `OraTimeTrackingDeletion`; never let the web process execute arbitrary elevated commands.
- [ ] Implement a constrained local IPC protocol for deletion with fixed operations, pinned install paths, access control, and durable progress/status reporting.
- [ ] Before any destructive action, prompt in the deletion service/console for explicit confirmation. Accept only `y`, `Y`, `yes`, or `YES`; every other answer means No.
- [ ] Separately ask whether to create the requested Excel backup, with the same exact affirmative answers; every other answer means No. Confirm the backup is complete before proceeding if requested.
- [ ] On confirmation, stop and remove the updater and application runner services, remove application files and database as requested, then stop and remove the deletion service last.
- [ ] Make cancellation and failures safe: no partial deletion before confirmation; preserve logs/status and provide actionable recovery if service removal or file cleanup fails.
- [ ] Test the full protocol and lifecycle on a disposable Windows VM/install only, including negative answers, malformed input, service-stop failure, Excel export failure, partial removal, and successful final service/file/database absence.

## 7. README and release documentation

- [x] Update the README and `AGENTS.md` to describe the delivered project permissions and deletion limits.
- [ ] Update the README after each delivered feature so its backup artifacts, port selection, service names, and uninstall behavior match the implementation.
- [ ] Keep installation/update/uninstall steps visually scannable and in pure Markdown; do not use raw HTML.
- [ ] Document migration from the current two-service topology and preserve safe backup/restore guidance.
- [ ] Update this checklist and `AGENTS.md` history when work is completed; do not mark items done until tests and disposable Windows validation have passed.

## Suggested implementation order

1. Project permissions and project deletion rules.
2. Time-entry deletion and regression tests.
3. Owner-only complete Excel backup and export tests.
4. Installer port prompt and collision retry.
5. Three-service topology and migration strategy.
6. Deletion service and in-app uninstall protocol.
7. README, release packaging, and disposable Windows end-to-end validation.
