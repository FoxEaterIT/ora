# Tauri desktop release plan

This checklist defines the work required before Ora Desktop can be distributed. The current Tauri client is a preview; do not publish or bundle it into the Ora installer until every release gate is completed and validated.

## Product scope

Ora Desktop is limited to sign-in, multiple Ora server profile management, and time tracking. Projects, My hours, reports, backups, account administration, and other management features remain available in the web app only. The desktop API allowlist and server-side authorization remain mandatory regardless of hidden UI.

## Release goals

- [ ] Desktop authentication uses Ora credentials and issues desktop-only sessions without creating browser cookies.
- [ ] Sessions persist across server restarts, support expiry and revocation, and behave correctly across multiple app instances.
- [ ] Desktop credentials are stored securely on supported clients and are never written to logs or ordinary configuration files.
- [ ] The packaged frontend, Tauri permissions, CSP, and network origins are restricted and reproducible.
- [ ] Authorization limits desktop sessions to the agreed timer operations and the authenticated user's own time entries.
- [ ] Installer, updater, recovery, and removal behavior are explicitly designed and verified.
- [ ] Automated and manual release tests pass on supported Windows versions.

## Phase 1 — Define security and product contract

Approved on 2026-10-17 in [`desktop-security-contract.md`](desktop-security-contract.md). The decisions below supersede earlier preview assumptions. Implementation has not started.

- [x] Confirm supported platforms and minimum OS/WebView2 versions. Windows 10 and 11 with WebView2.
- [x] Specify desktop API allowlist, request methods, response fields, and per-role project access. Entries stay scoped to the signed-in user, including Owner and Admin. Projects follow the current web rules; teams are read-only and limited to the user's own teams.
- [x] Define session lifetime, refresh policy, concurrent device policy, logout/revocation semantics, and behavior after password reset, account deactivation, or role change. Absolute 30-day lifetime, no refresh, one desktop session per user.
- [x] Decide whether desktop login requires rate limiting, lockout/backoff, and audit events; define privacy-safe logging requirements. Progressive delay by IP and email; no permanent lockout; logs omit passwords, raw tokens, and full email addresses.
- [x] Choose server-side session storage compatible with SQLite and the deployment topology. Durable SQLite only; multi-instance hosting is out of scope.
- [x] Decide client token storage per platform (Windows Credential Manager/DPAPI-backed secure store); do not use localStorage or plaintext files for long-lived bearer tokens.
- [x] Document trusted-origin policy. HTTPS is allowed. Each new HTTP origin requires explicit confirmation and is remembered per origin.
- [x] Write and review threat model covering token theft, replay, CSRF/CORS, malicious project text, compromised desktop packages, and downgrade/update attacks. The first release is unsigned, published with a checksum, and has no automatic updater.

**Gate:** passed for the written contract. Phase 2 may persist sessions and enforce the allowlist. The current preview does not yet satisfy this contract.

## Phase 2 — Durable desktop authentication

Implementation status: complete for the agreed local scope. Session persistence, revocation hooks, login throttling, the route allowlist, and disposable-SQLite HTTP integration coverage are implemented. The API uses Prisma migration `20261017120000_desktop_sessions`; Windows service lifecycle validation remains in Phase 6.

- [x] Add a versioned Prisma migration for desktop sessions: hashed opaque token, user reference, creation/expiry/revocation timestamps. Never persist raw bearer tokens.
- [x] Implement token issuance, lookup, expiry rejection/marking, and revocation against SQLite; issue one live desktop session per user.
- [x] Update `POST /api/desktop/login` to verify active accounts and passwords, issue only desktop sessions, return no-store responses, and use consistent non-enumerating credential errors.
- [x] Add login throttling/backoff and security event logging according to the approved contract.
- [x] Validate desktop tokens at every allowed endpoint and reject them everywhere else. Audit route handlers individually; hiding UI is not authorization.
- [x] Revoke relevant desktop sessions on logout, account deactivation, password reset/change, and other policy-defined events.
- [x] Add tests for correct/wrong credentials, passwordless/deactivated users, expiry, restart persistence, multiple processes, revocation, and account changes.
- [x] Add authorization tests for every permitted and forbidden HTTP method and role; verify entry ownership and project membership constraints.
- [x] Add integration test that starts the Next.js HTTP server against a disposable migrated SQLite database, exercises desktop login, role and entry authorization, allowed/forbidden paths and methods, then restarts the server and confirms session persistence and logout revocation.

**Gate:** complete for the agreed local scope; the HTTP integration test passes with a disposable SQLite database. Full Windows service lifecycle validation remains assigned to Phase 6.

## Phase 3 — Secure native client credential lifecycle

Implementation status: complete by project decision. Windows-native keyring commands are wired through Tauri and the client uses them for the opaque desktop token; the saved server origin remains a non-secret user preference. Clean-VM and cross-account validation could not be performed in the available environment and are recorded as an untested limitation, not as passed tests.

- [x] Add Windows-native secure storage through the Rust `keyring` crate; expose only fixed save/load/delete commands to the frontend.
- [x] Never persist passwords; clear the password field immediately after login attempt, use no password storage, and reject fetch redirects.
- [x] Restore a session from secure storage on launch; clear local credentials after failed/revoked session validation.
- [x] Make Sign out best-effort revoke the server session and always attempt local token removal while offline.
- [x] Keep token bytes out of localStorage and constrain the credential record to one fixed keyring entry; operating-system per-user vault boundaries apply.
- [x] Implement token persistence, revoked-session cleanup, offline logout cleanup, and credential cleanup paths. Windows clean-VM and cross-account validation could not be performed in the available environment; this limitation is documented and these validations are not claimed as passed.

**Gate:** considered complete by project decision. Windows VM, keyring failure behavior, offline logout, account isolation, and native restart validation were not fully exercised in this environment; record this limitation and do not represent those checks as passed.

## Phase 4 — Production frontend and Tauri hardening

- [x] Replace the development-only `devUrl` flow with a production `frontendDist` build pipeline and a deterministic, versioned frontend artifact. The frontend is bundled using esbuild; the main HTML filename is content-hashed and build-info records app/frontend versions.
- [x] Remove development URLs, prompts, debug code, and unnecessary preview/handoff UI from release builds. The development server remains configured only for Tauri development mode.
- [x] Set a restrictive CSP with only required script/style/connect/image sources; remove inline allowances where feasible and use nonces/hashes if required. Script/style hashes are injected into the generated artifact; connect-src permits HTTP/HTTPS because server origin is user-configured.
- [x] Review Tauri capabilities/permissions and grant only required window and secure-storage operations; keep filesystem, shell, and arbitrary URL access disabled unless justified. Capability `desktop-main` grants only the custom keyring permission; `withGlobalTauri` is disabled.
- [x] Restrict frontend API requests to paths resolved against the validated configured Ora origin; reject mismatched origins and redirects before credentials can be forwarded. Automated WebView/network interception testing remains outstanding.
- [x] Validate server URLs (allow HTTP and HTTPS; reject credentials, path/query/fragment; show clear connection errors). Remote HTTP must require explicit user confirmation because it is unencrypted.
- [x] Review output escaping, accessibility, keyboard navigation, localization, responsive sizing, and theme persistence in both light and dark modes by source inspection. Source review confirmed escaping for interpolated project/user values, responsive layout, persisted themes, all 31 EN/IT/ES message keys and localized theme names, Escape dismissal/focus return for the account menu, focus placement after connection, polite announcement of daily-total updates, and localized idle timer text. This is not a manual accessibility validation: keyboard-only and assistive-technology checks were not performed; native WebView validation remains a Phase 6 test. Audit notes: [`desktop-phase4-audit.md`](desktop-phase4-audit.md).
- [x] Review the configured icon artwork; owner confirmed the ICO is approved on 2026-10-19. Tauri/Cargo are aligned at `0.1.0`; generated frontend metadata records that desktop version and Ora package version `0.4.0`. Signing identity is intentionally deferred to distribution. A coordinated version bump policy is documented in [`desktop-phase4-audit.md`](desktop-phase4-audit.md); do not bump versions for this hardening step.
- [x] Run dependency, Rust, and frontend vulnerability checks; pin and review production dependencies. On 2026-10-19, `npm audit --json` reconfirmed 12 vulnerabilities (9 high, 3 moderate); suggested automated fixes include major-version changes and were not applied. This is not an acceptance of the risk. Explicit owner acceptance or remediation and a fresh audit remain required before distribution. Cargo tests/check and TypeScript/i18n checks passed previously; Rustfmt is unavailable.
- [ ] Verify clean-checkout reproducibility with a disposable fresh checkout/worktree, `npm ci`, frontend generation, Rust checks/tests, and supported bundle builds. This has not been attempted; procedure and prerequisites are recorded in [`desktop-phase4-audit.md`](desktop-phase4-audit.md). Do not simulate this by deleting generated files from the active working tree.

**Gate:** Phase 4 source review, icon approval, and implementation-side origin/capability/frontend hardening are complete. This is a project decision to close the phase, not a claim that every distribution/release validation has passed. Clean-checkout reproducibility, manual keyboard/accessibility testing, dependency status, native WebView/security review, and Windows installation/operation remain unverified or assigned to later validation. Release-mode executable and MSI/NSIS installer builds succeeded locally (`cargo tauri build --bundles msi,nsis --ci`); installer installation and operation have not been tested.

## Phase 5 — Installer, updater, and operations

Approved decisions and implementation/validation plan: [`desktop-phase5-plan.md`](desktop-phase5-plan.md).

- [x] Add a manual-only Windows workflow for MSI/NSIS installers on existing stable GitHub releases marked `Ora-Desktop-Release: true`; keep them separate from the Ora server installer and existing server ZIP/updater. Local x64 MSI/NSIS packaging succeeded; workflow execution remains unverified. `scripts/publish-release.ps1` bumps server and desktop versions together, creates a marked release, and dispatches the workflow; its asynchronous result must still be checked in GitHub Actions.
- [x] Generate per-installer SHA-256 checksums and attach installers plus `SHA256SUMS.txt` to the matching GitHub Release. The authenticated Ora app displays manual links and the GitHub asset digest. A GitHub-provided digest is not an independent authenticity proof; workflow output remains unverified.
- [ ] Keep the desktop notice independent of manager-only web-server update controls; localize it in EN/IT/ES, fail closed on invalid metadata, and degrade gracefully when GitHub is unavailable.
- [ ] Confirm install-over-install preserves the user's secure session and preferences; clean uninstall removes only Ora Desktop's fixed keyring token and its own local preferences, not server/time data or unrelated app data.
- [ ] Document manual rollback/recovery, offline behavior, WebView2, firewall/proxy, server URL, HTTPS and explicit unencrypted HTTP confirmation, and safe diagnostics.
- [ ] Define pilot rollout, monitoring, server-side withdrawal of the download, GitHub release withdrawal notes, and re-enable criteria. No automatic updater or client kill switch.
- [ ] Verify Windows packaging workflow, checksums, authenticated notice, GitHub outage/malformed metadata handling, MSI/NSIS install/upgrade/uninstall/reinstall, and manual recovery. Clean and previously upgraded Windows-machine results must be recorded as evidence; builds alone do not satisfy this gate.

**Gate:** Phase 5 may be closed by project decision with unrun Windows install/upgrade/uninstall/recovery tests explicitly documented as unverified. This does not satisfy the Phase 6 release-validation gate.

## Phase 6 — Full web-app parity

**Approved scope:** all functions permitted by the current desktop security contract, for Owner, Admin, and User accounts that are already active. The desktop does not include setup/activation, people/team administration, reports/export, backup, account management, server update, or Ora server uninstall. Those web functions remain intentionally unavailable in the desktop unless a separate security decision changes the contract. The desktop remains a client of an Ora server; it does not bundle or replace the server/database. Target Windows 10/11 and EN/IT/ES. Keep the window fixed and non-resizable at 380 × 680 px.

The current desktop API contract exposes only a subset of web functionality. Visual similarity is not enough: each in-scope page/action needs an appropriate server-enforced API policy. Do not weaken the contract or grant desktop sessions browser-cookie access to achieve parity.

### Approved product decisions

| Topic | Decision |
|---|---|
| Feature scope | All desktop-permitted client functions; retain existing security exclusions for management, reports/export, backup, account/setup, server updates, and server uninstall. |
| Roles | Owner, Admin, and User may sign in with an active account; role authorization continues to apply. |
| Server profiles | Users can configure and save multiple Ora server profiles, select/switch profiles, and keep credentials/session tokens isolated per server. |
| Server origins | HTTPS is supported. HTTP requires explicit trust confirmation for each origin. Never store credentials or tokens in URLs or plaintext configuration. |
| Window/platform/locales | Resizable, opens at 440 × 760 px (minimum 380 × 620); Windows 10/11; English, Italian, and Spanish. |
| Server topology | Desktop connects to an existing Ora server and does not bundle a local Ora server/database. |

### Implementation checklist

#### Assistant implementation TODO (incremental; separate from Windows validation)

- [x] Add deterministic session-generation tests for stale responses and overlapping profile switches; guard desktop API responses and profile connection results so stale requests cannot update branding, projects, entries, or user state. Native WebView race behavior still needs Windows validation.
- [x] Harden restore failure handling: validate the active normalized origin before keyring access, preserve credentials on transient failures, discard only the matching profile credential after explicit 401/403, and ignore late restore completions after profile switches. Adapter-level rejection/isolation tests pass; interactive UI and login-flow failure tests remain a follow-up.
- [x] Reconcile README, desktop README, parity inventory, and this checklist with implemented source behavior and clearly distinguish automated coverage from native validation. Security-contract review and broader security sign-off remain separate release gates.
- [x] Complete the first shared Projects workflow: `src/components/projects-view.tsx` is mounted in the Tauri shell through `src-tauri/projects-adapter.ts`; it uses the approved `/api/desktop/session` route, existing project DTO, and desktop allowlist. Desktop hides web-only team/user assignment and manager archive/delete controls; all roles retain allowed project create/edit/member assignment capabilities. Adapter, role-policy, API-contract, and frontend-build checks pass. Native Tauri interaction still requires Windows validation.
- [x] Extract shared Timer, My hours, and Projects workflows with separate web/Tauri adapters. My hours remains read-only in desktop under the current API contract.
- [ ] Decide whether the approved read-only Teams view has enough value to retain; extract it only if included.
- [x] Add automated API-boundary coverage for route/method allowlisting, normalized origin, token snapshot/omission on login, redirect rejection configuration, and stale response rejection. Existing legacy-panel behaviors still need broader focused coverage.
- [x] For the Projects slice, run tests, TypeScript, i18n, desktop frontend build, lint, and whitespace checks; update user-facing and developer documentation/history. Continue this discipline for each following slice.

**Current step:** review read-only Teams against the approved desktop scope and decide whether to retain/extract it. Timer, My hours, and Projects use shared views with separate web/Tauri adapters. Native Windows keyring/WebView/lifecycle tests, and two-live-server end-to-end testing, require a Windows/user environment and are not counted as assistant implementation tasks.

- [x] **Parity inventory:** mapped web routes, navigation, role-specific controls, and workflows to the approved scope in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). The inventory identifies the current API coverage and a possible session/profile endpoint gap; implementation remains pending.
- [x] **Server profiles and onboarding design:** documented in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). Profiles store only a user label and validated server origin in local preferences; duplicate normalized origins are rejected. Tokens are stored separately in the OS keyring under a deterministic per-origin account key (never in preferences); profile switching validates/restores only that origin's token, and profile removal revokes best-effort then deletes only that origin's keyring item. HTTP trust is remembered per normalized origin and must be reconfirmed for a new origin. Origins remain scheme/host/port only—no URL credentials, path, query, or fragment—so reverse-proxy base paths are not supported by this client contract. First launch opens profile setup; users can add/select/edit/remove profiles later. Unreachable servers retain their profile and show retry/offline state without sending credentials to another origin.
- [x] **Authentication/session UX design:** documented login, restore, logout, expiry/revocation, deactivation/password change, recovery, offline, and multi-profile behavior in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). UI/API implementation and tests remain pending.
- [x] **API and authorization gap analysis:** recorded the route/action mapping and minimum safe API changes in [`desktop-parity-inventory.md`](desktop-parity-inventory.md), including a narrowly allowlisted session endpoint, membership-scoped team reads, explicit safe mutation/entry DTOs, and no-store desktop responses. Initial implementation now adds the session endpoint, safe project/entry mutation DTOs, and no-store headers on covered successful responses; remaining error-path consistency and broader integration coverage are pending. No authorization was broadened.
- [x] **Shared UI architecture decision:** source review and the recommended shared-client-component architecture with web/Tauri adapters are documented in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). Code extraction remains pending until the desktop API gaps are implemented and tested.
- [x] **Parity details design:** documented locale, branding/theme isolation, role-based navigation, read-only team behavior, and fixed-window accessibility/layout requirements in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). The standalone UI still has duplicate strings and is not yet integrated with safe server config; implementation remains pending.
- [x] **Desktop UX design:** documented server identity, loading/empty/error/offline/retry/session-expiry states, safe write/reconnect behavior, confirmations, keyboard/focus, and diagnostics requirements in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). Implementation and UI validation remain pending.
- [x] **Security review plan:** detailed origin, HTTP trust, token, redirect, CSP/Tauri capability, server authorization, DTO/no-store, untrusted-content, and persistence checks are recorded in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). Actual security review remains pending implementation.
- [x] **Automated coverage plan:** unit/API/UI test matrix and browser-vs-desktop comparison procedure are recorded in [`desktop-parity-inventory.md`](desktop-parity-inventory.md). Tests and comparison evidence remain pending implementation.
- [ ] **Build/runtime validation:** verify `cargo run` development and production MSI/NSIS builds show the same intended in-scope Ora interface; confirm fixed window dimensions, profile behavior, server outage handling, clean install, and upgrade. Do not publish a release as part of implementation.
- [ ] **Docs and gate:** maintain this technical checklist and update the user README only with completed user-facing behavior and requirements—not project todo lists. Keep desktop distribution disabled until parity, security review, and Windows runtime tests pass.

**Parity gate:** do not claim equivalence while any in-scope page, role behavior, locale/theme state, or workflow is missing. Parity means the approved desktop scope, not every web administration feature. Changes to the exclusions or security contract require a separate explicit approval before implementation.

## Phase 7 — Release validation

- [ ] Build and install from a clean Windows VM with only documented prerequisites.
- [ ] Test owner, admin, and standard user sign-in; invalid credentials; deactivated/passwordless users; session expiry/revocation; and password change/reset.
- [ ] Test assigned/unassigned/archived projects and start/stop behavior, duplicate active timer rejection, network loss, server restart, and service multi-instance topology.
- [ ] Confirm desktop sessions cannot access management, export, backup, account, or arbitrary routes, regardless of UI manipulation.
- [ ] Verify no password/token leakage in application logs, browser devtools, crash output, files, installer logs, or network URLs.
- [ ] Test HTTPS validation, redirect handling, certificate failures, and any approved loopback-only HTTP behavior.
- [ ] Test accessibility, localization, theme behavior, window resizing, high DPI, and supported Windows versions.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run check:i18n`, Prisma migration checks, Rust tests/build, and production packaging checks.
- [ ] Have another person review security-sensitive changes and the release checklist evidence.
- [ ] Update README user guidance, desktop privacy/security notes, support policy, and version history.

**Final release gate:** every checkbox above is complete, test evidence is recorded, security review is approved, and signed artifacts are verified before publication.

## Local preview workflow (not a release test)

The current preview can be tried with a local Ora instance and the demo accounts documented in the main README. A successful preview does not satisfy any release gate above. Do not distribute preview builds or expose them to untrusted networks.
