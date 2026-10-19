# Tauri desktop release plan

This checklist defines the work required before Ora Desktop can be distributed. The current Tauri client is a preview; do not publish or bundle it into the Ora installer until every release gate is completed and validated.

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
- [ ] Review output escaping, accessibility, keyboard navigation, localization, responsive sizing, and theme persistence in both light and dark modes. Source review confirmed escaping for interpolated project/user values, responsive layout, and persisted themes. On 2026-10-19 the account menu received Escape dismissal, focus handling, and outside-click behavior; duplicate server/HTTP-confirmation fields were removed, and visible focus indicators plus an accessible description label were added. EN/IT/ES locale selection and persistence have now been implemented in the standalone UI. Full keyboard/accessibility and translated-flow review, plus assistive-technology/native WebView validation, remain outstanding (native validation is a Phase 6 test). Audit notes: [`desktop-phase4-audit.md`](desktop-phase4-audit.md).
- [ ] Generate and visually verify official app icons, product metadata, signing identity, and version information. The configured ICO is a valid single-image 256×256 resource, but its artwork remains an unreviewed scaffold; signing identity is intentionally deferred to distribution. Tauri/Cargo are aligned at `0.1.0`; generated frontend metadata records that desktop version and Ora package version `0.4.0`. A coordinated version bump policy is documented in [`desktop-phase4-audit.md`](desktop-phase4-audit.md); do not bump versions for this hardening step.
- [x] Run dependency, Rust, and frontend vulnerability checks; pin and review production dependencies. On 2026-10-19, `npm audit --json` reconfirmed 12 vulnerabilities (9 high, 3 moderate); suggested automated fixes include major-version changes and were not applied. This is not an acceptance of the risk. Explicit owner acceptance or remediation and a fresh audit remain required before distribution. Cargo tests/check and TypeScript/i18n checks passed previously; Rustfmt is unavailable.
- [ ] Verify clean-checkout reproducibility with a disposable fresh checkout/worktree, `npm ci`, frontend generation, Rust checks/tests, and supported bundle builds. This has not been attempted; procedure and prerequisites are recorded in [`desktop-phase4-audit.md`](desktop-phase4-audit.md). Do not simulate this by deleting generated files from the active working tree.

**Gate:** implementation-side origin/capability/frontend hardening is in place; overall Phase 4 remains open pending visual icon/product metadata review, explicit dependency vulnerability acceptance or remediation, documented coordinated versioning, broader keyboard/localization review, clean-checkout reproducibility, native WebView/security review, and final review. Release-mode executable and MSI/NSIS installer builds succeeded locally (`cargo tauri build --bundles msi,nsis --ci`); installer installation and operation have not been tested.

## Phase 5 — Installer, updater, and operations

- [ ] Choose distribution channel: standalone signed desktop installer, Ora server installer download, or both. Keep the desktop client decoupled from server installation unless an explicit deployment design says otherwise.
- [ ] Define signed update metadata, signature verification, rollback, interrupted-update recovery, and supported-version policy. Do not reuse the web-service updater blindly for the client.
- [ ] Decide update UX and whether updates are automatic, user-confirmed, or administrator-managed.
- [ ] Define uninstall behavior, including whether secure tokens and preferences are deleted and how user data is handled.
- [ ] Document firewall/proxy requirements, server URL configuration, HTTPS certificates, offline behavior, and support diagnostics without secrets.
- [ ] Publish checksums and signed artifacts; protect signing keys and release credentials.
- [ ] Prepare a staged rollout and a way to stop distribution/updates if a critical issue is found.

**Gate:** install, upgrade, rollback, uninstall, and recovery tested on clean and previously upgraded machines.

## Phase 6 — Release validation

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
