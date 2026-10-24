# Ora Desktop parity inventory

Source review date: 2026-10-23. This inventory maps the current web UI to the approved desktop scope in [`desktop-release-checklist.md`](desktop-release-checklist.md) and the existing API contract in [`desktop-security-contract.md`](desktop-security-contract.md). It describes source behavior and current desktop implementation; it does not claim native runtime validation.

## Pages and navigation

| Web route / area | Web roles | Desktop classification | Required desktop behavior / rationale |
|---|---|---|---|
| `/login` | Anonymous | In scope, adapted | Desktop-token login for active accounts. Do not create browser cookies. |
| `/setup` | Anonymous initial setup | Excluded | Initial owner provisioning remains a web/server setup flow. |
| `/` Timer | All authenticated roles | Implemented, shared view | Shared `TimerView` renders in web and Tauri with separate API adapters. Desktop currently limits controls to start/stop and relies on the guarded desktop API; desktop editing/deletion parity remains out of scope for this slice. |
| `/timesheet` My hours | All authenticated roles | Implemented, shared view | Shared `MyHoursView` renders in web and Tauri via separate adapters. Desktop currently presents the permitted own-entry list read-only; web retains manual create/edit/delete. |
| `/projects` | All authenticated roles | In scope | Create and edit projects and assignments under the web policy. Owner/Admin may set team/archive state and delete only projects with no time history; User may not perform those manager actions. |
| `/manage/projects` (legacy/management view) | Owner/Admin controls; some project operations available to all roles from `/projects` | Not a separate required desktop page | Implement the in-scope project capabilities in a desktop-appropriate way; avoid duplicate web management navigation. |
| `/manage/teams` | Owner/Admin in web navigation; teams have read-only desktop API scope | Partially in scope | Read the user's permitted teams and member names/emails only. Team creation, editing, assignment administration, and deletion remain excluded. |
| `/manage/people` | Owner/Admin | Excluded | People administration, activation/deactivation, and password reset are expressly forbidden to desktop sessions. |
| `/manage/report` | Owner/Admin | Excluded | Reports and cross-user/project/team filtering are not available to desktop sessions. |
| `/manage/backups` | Owner | Excluded | No data backup/export from desktop. |
| `/manage/uninstall` | Owner | Excluded | Server uninstall and deletion broker controls remain web/Windows operations. |
| `/account` | Authenticated; self-service web account changes | Excluded | No account email/password changes in desktop. Sign-out is in scope through desktop session revocation. |
| Shell language/theme controls | Authenticated | In scope | EN/IT/ES and supported theme presets, persisted per desktop preference. Branding comes from safe server config. |
| Shell Ora server update controls | Owner/Admin | Excluded | Server updating is not a desktop-client function. |
| Desktop release notices in web Shell | Authenticated web users | Not applicable to desktop shell | This is the web app's notice for the separate desktop installer; do not reproduce it as an Ora server update feature. |

## Server profiles and onboarding design

- The first launch starts with no active server profile and presents a setup form; login is unavailable until a valid profile is selected. The current panel now has local profile selection, save, and removal controls; profile usability and removal-flow confirmation still need refinement.
- A profile consists of a user-editable display name and a normalized origin (`http[s]://host[:port]`). Reject credentials, path (other than `/`), query, fragment, unsupported schemes, and malformed hosts. Normalize scheme/host/default port for duplicate detection; do not silently merge profiles with different origins.
- Save profile metadata, active profile id, locale/theme preferences, and per-origin HTTP trust decisions as non-secret local preferences. Never save passwords or bearer tokens there.
- Store each opaque token in the OS credential store using a fixed service identifier and a deterministic account identifier derived from the normalized origin (e.g. a SHA-256 digest). Validate the account-key format natively; do not accept arbitrary keyring names from frontend input. This replaces the current single global `session` record, which cannot isolate multiple active server profiles.
- Switching profiles must select only that profile's token and issue requests only to its exact normalized origin. If no token exists, show that profile's login form. On failed token validation, delete only that profile's keyring item. On logout, revoke best-effort at that profile's server and always delete only its local token.
- HTTP trust is confirmed for each normalized HTTP origin before login or authenticated requests, and remembered separately from the token. HTTPS requires no such prompt. If a profile changes origin, treat it as a new origin and require fresh HTTP trust where applicable; never transfer its old token to the changed origin.
- Removing a profile asks whether to sign out; revoke its session best-effort, delete its origin-specific token, forget its trust decision, then remove its metadata. It does not contact or alter other server profiles.
- Only origin roots are supported. Reverse-proxy base paths are rejected rather than ambiguously composing API paths. A server outage keeps the profile and token, presents retry/reconnect, and does not fall back to another profile or server.
- The first-access setup/activation remains on the server's web UI; desktop login is for active accounts only.

### Session lifecycle and recovery UX

- **Login:** after choosing a server profile, collect email/password and clear the password input immediately after the request. Use only `POST /api/desktop/login`; display the same localized credential error for unknown, wrong-password, passwordless, pending-owner, and deactivated accounts. Never create or accept browser cookies.
- **Restore:** at launch, select the last active profile, load only its token from the OS keyring, and validate it against that server using the narrowly scoped desktop session/config endpoint. No token means show that profile's login. Rejected/expired/revoked token means delete only that profile's token and return to login with a localized message.
- **Active session:** session lifetime remains absolute 30 days with no refresh; login on another device/session may revoke the previous token under the existing one-live-session-per-user policy. A role change requires login again and refreshed role-specific navigation.
- **Logout:** request server revocation when reachable; delete local token regardless of network outcome. Keep the profile and its HTTP trust choice, because they are not credentials. Offer explicit remove-profile separately.
- **Account changes/deactivation:** server revocation is authoritative. If the next authenticated request fails, clear that profile's token. Direct users to the web app for password change, reset, activation, or account recovery; the desktop does not implement those operations.
- **Network/server outage:** retain the profile and token, show retry and current server identity, and do not silently log out solely due to a transport failure. Do not send the token to a fallback origin. Distinguish transport failure from HTTP 401/403 session rejection.
- **Multiple profiles:** one active profile at a time. Switching profiles never copies session state; it restores the selected profile's own keyring item or presents login. A token can be rejected by its server if another client replaced the account's single live session.

## Shared UI architecture decision

## Localization, branding, themes, and role navigation decision

- **Locale:** support English, Italian, and Spanish using the typed dictionaries in `src/i18n/messages.ts` for all user-facing text, including desktop-only profile/network/session states. Persist locale as a desktop preference and set the document language. Do not add untranslated hardcoded labels. The selected locale is a client preference, not tied to a server profile.
- **Branding:** after desktop session validation, consume only the safe fields from `GET /api/desktop/config`. Validate logo paths as same-server `/custom/...` paths and reject external URLs, traversal, or unsafe schemes. On profile switch, discard the previous server's branding and fetch the selected server's config; on logout/outage show a neutral Ora fallback without leaking cached branding across profiles.
- **Themes:** expose only server-configured available light presets plus dark mode. Validate persisted theme values against the active profile's allowlist; fall back to that server's safe default. Locale/theme are local client preferences; server-specific available themes and labels are not copied between profiles.
- **Project/team palettes:** read only validated server config values and validate colors before CSS use. Teams are a read-only, membership-scoped view; no team color/administration or member editing controls.
- **Role navigation:** all roles see Timer, My hours, and Projects. The Teams view is a read-only team-membership screen if retained in desktop navigation. Owner/Admin can use project team/archive/delete controls only where the project API permits; User cannot see or invoke those controls. No People, Reports, Backups, Account, Setup, Update, or Uninstall links for any desktop role. Server-side API checks remain authoritative.
- **Responsive/fixed window:** reuse Ora design tokens and shared controls, but ensure layout works at the fixed 380 × 680 px viewport, with scrollable content, visible focus, keyboard operation, and no horizontal overflow. Validate at supported Windows DPI scaling; preserve the non-resizable window.
- **Current gap:** standalone `src-tauri/index.html` still has separate hardcoded EN/IT/ES strings and local theme handling; it is not yet using web dictionaries or shared authenticated feature views. Profile-scoped request/session-generation guards reject stale API, restore, and connection results, and transient restore errors retain that profile's keyring item; explicit 401/403 removes only the matching profile credential. These behaviors have adapter/unit coverage, but interactive UI and native WebView behavior are not validated here. Branding/config is reset to the Ora fallback on profile changes and connection failures. These remain migration targets, not completed parity.

## Desktop interaction and recovery UX decision

- Show the active server profile name in the shell at all times after connection; profile selection remains reachable without exposing token data. Confirm server changes, profile removal, and destructive project/entry actions with localized in-app dialogs, never native browser prompts.
- Provide explicit loading, empty, request-error, offline, retry, and session-expired states on every feature. A transient network failure preserves the session; HTTP 401/403 from session validation clears that profile's token and returns to login. Preserve unsaved form input where safe and do not retry writes automatically.
- On reconnection, require a user retry or bounded safe read retry; never redirect requests or forward credentials across origins. All authenticated fetches use `redirect: "error"`, an exact allowlisted API path/method, and the selected normalized origin.
- Provide visible keyboard focus, logical tab order, labels, Escape behavior for dialogs/menus, focus restoration, and polite status announcements. Ensure controls fit and content scrolls in the fixed 380 × 680 px window at supported DPI scaling.
- Show clear offline/server identity state but do not log password/token, full email, or credential-store contents. Diagnostics may include app version, normalized origin, locale, and non-sensitive error category only.
- Teams remain read-only. Project and time-entry destructive actions require a localized confirmation; server-side authorization remains mandatory even when UI controls are hidden.

## Shared UI architecture decision

**Recommended direction: extract the in-scope application UI into shared client-side React components and keep separate web and Tauri entry shells.** Do not load the remote server's full website inside Tauri and do not embed/copy the Next.js App Router into the desktop package.

Why: the authenticated Next route group is server-rendered and depends on Next navigation, cookie auth, Prisma-backed layouts, and server-only configuration. Tauri currently ships a static HTML bundle, while the desktop must authenticate with a bearer token and must never gain cookie access. Pointing a WebView at the server's web UI would also make the UI server-delivered, complicate origin/CSP rules, and leave browser-cookie assumptions and excluded page routes to defend. Maintaining a second hand-written panel duplicates behavior and cannot meet parity.

Implementation shape:

1. Extract client-side feature views and reusable controls for Timer, My hours, Projects, permitted Teams read-only view, login, and shared loading/error/confirmation states into browser-safe modules with typed data contracts.
2. Provide an injected API client interface. The web adapter uses same-origin cookie fetch; the Tauri adapter uses the selected profile origin, desktop token header, redirect rejection, and strict allowed-path/method mapping. Components do not read cookies, tokens, Prisma, or `process.env`.
3. Keep web App Router pages and authorization/layouts as thin web adapters around shared views. Preserve current server-side role/API enforcement; the UI is not a security boundary.
4. Build the Tauri frontend from the same shared feature modules with a dedicated desktop shell for profiles, desktop login/session restore, current-server display, locale/theme, and sign-out. Exclude management routes and web-only updater/account controls at the shell/route level.
5. Supply server branding through the authenticated desktop config endpoint and theme/locale preferences through a desktop-safe preference adapter. Validate a fixed 380 × 680 window and overflow/high-DPI behavior.
6. Keep route components free of Next-only hooks where feasible; isolate navigation behind a small adapter so web uses Next router and desktop uses local view state/history.

The migration should be incremental: first establish typed adapters and tests against existing behavior, then migrate one in-scope view at a time. A desktop API boundary now lives in `src-tauri/desktop-api.ts` and is used by the panel; it owns origin/path/method allowlisting, token header attachment, redirect rejection, and stale-profile result rejection. The web Projects route renders extracted `src/components/projects-view.tsx` through a cookie-fetch adapter; the Tauri shell also mounts it through `src-tauri/projects-adapter.ts`, which maps session bootstrap to `/api/desktop/session`. The view skips unsupported desktop team/user directory reads and hides web-only archive/delete controls while retaining project create/edit/member assignment actions allowed to all roles. The web `/timesheet` route now renders `src/components/my-hours-view.tsx` through a cookie-fetch adapter, and Tauri mounts that same view through `src-tauri/my-hours-adapter.ts`; desktop permits only own-entry/project reads, so My hours is read-only there while web retains manual create/edit/delete. Desktop project GET responses use the safe `serializeDesktopProject` DTO; member assignment in the desktop route does not require `/api/users`. Do not begin broad page refactoring until the API/authorization additions and integration tests in the preceding section are implemented.

## Security review and verification plan

Security review is a release gate, not a substitute for server authorization. Review the implementation and test these boundaries directly:

| Surface | Required review/test |
|---|---|
| Origin/profile input | Accept only normalized HTTP(S) origin roots; reject credentials, non-root paths, query/fragment, malformed/IPv6 edge cases as appropriate, and duplicate origins. Ensure origin changes invalidate trust and do not reuse tokens. |
| HTTP trust | Require an explicit per-origin confirmation before any login or bearer request over HTTP. Persist only the normalized origin decision; changing host/scheme/port requires a new confirmation. Warn that HTTP is unencrypted. |
| Token lifecycle | Raw token only in OS keyring and request header. Validate native keyring account identifiers against a fixed digest format. No token/password in local preferences, URL, logs, exceptions, diagnostics, or telemetry. Profile A tokens must never reach profile B. |
| Requests/redirects | Fixed method/path allowlist, exact selected origin, `redirect: "error"`, no arbitrary caller-supplied URL, and no token on login. Test redirects and malicious response links do not receive tokens. |
| CSP/Tauri | Inspect generated production CSP, capability permissions, `withGlobalTauri`, frontend bundle/source maps, and navigation behavior. No filesystem/shell/arbitrary invoke capability; only fixed keyring commands. Test the production artifact, not only source HTML. |
| Server authorization | Directly call every permitted and forbidden path/method with desktop tokens for OWNER/ADMIN/USER. Verify own-entry restriction, membership-scoped teams, project role rules, and denial of account/people/team writes/report/export/backup/setup/update/deletion/handoff. |
| Response/data minimization | Assert explicit DTO keys for session/config/project/entry/team reads and mutations. Assert `Cache-Control: no-store` on successful and error responses carrying or depending on desktop authentication. |
| Untrusted content | Render project/team/user strings as text; test HTML/script-like values in labels and descriptions. No unsafe HTML injection. |
| Persistence/removal | Test profile edit/removal, keyring failure, offline logout, app restart, per-Windows-user separation, and ensure profile removal touches only its own secure token/trust record. |

### Automated test matrix

- Unit tests for origin normalization/rejection, duplicate detection, profile preference validation, deterministic keyring account derivation, and trust-per-origin behavior.
- Rust tests reject malformed keyring account IDs and verify allowed origin-digest identifiers; native keyring integration remains a Windows validation task.
- Frontend API-client tests prove exact origin/path/method enforcement, redirect rejection, no token on login, and token isolation during profile switching.
- API policy tests cover every allowlisted method/query and forbidden route/method. HTTP integration tests exercise session bootstrap, all three roles, own-entry constraints, safe DTO keys, no-store success/error responses, and session revocation/deactivation/expiry.
- UI tests cover first-launch profile setup, add/edit/remove/select, HTTP trust confirmation, login/password clearing, restore/session expiry, offline/retry, sign-out, role navigation, timer/timesheet/project operations, read-only teams, localization, and destructive confirmation. Test forbidden views are absent and APIs still deny direct calls.
- Maintain a repeatable browser-vs-desktop comparison using the same Ora server and account for every in-scope workflow, locale, theme, and role; record differences and evidence without including secrets.
- Before release, run TypeScript, lint, `npm test`, i18n checks, Prisma migration checks, Rust tests/build, production frontend generation/CSP inspection, and MSI/NSIS runtime validation. Manual Windows WebView, DPI, keyboard/accessibility, keyring, clean install/upgrade, and cross-account checks must be recorded separately; source/unit tests do not substitute for them.

## In-scope UI actions and current API coverage

| Workflow/action | Current web API | Desktop contract status |
|---|---|---|
| Login | `POST /api/auth/login` (web cookie) | Use `POST /api/desktop/login`; never use the web cookie endpoint. |
| Restore public branding/theme config | Client build config / `GET /api/desktop/config` | Allowed; fetch after login and on valid session restore. |
| Read visible projects | `GET /api/projects` | Allowed; response is field-whitelisted. |
| Create project | `POST /api/projects` | Allowed; same membership policy as web. |
| Edit project name/description/color/members | `PATCH /api/projects/:id` | Allowed subject to role and membership checks. |
| Set project team/archive | `PATCH /api/projects/:id` | Owner/Admin only. |
| Delete project without time entries | `DELETE /api/projects/:id` | Owner/Admin only. |
| Read own entries | `GET /api/entries?mine=1` | Allowed; exact `mine=1` query required. |
| Start/add own entry | `POST /api/entries` | Allowed; project access and duplicate active timer protections apply. |
| Edit own entry | `PATCH /api/entries/:id` | Allowed; must remain own-entry only. |
| Delete own entry | `DELETE /api/entries/:id` | Allowed; must remain own-entry only. |
| Read user's teams | `GET /api/teams` | Allowed, limited to team id/name/description and active member name/email. |
| Logout | `POST /api/desktop/logout` | Allowed; revoke server session and clear local secure token even offline. |
| Current user/session validation | No desktop `/api/me` allowlist route | Gap: determine whether login/config bootstrap and resource requests are sufficient, or add a minimal safe desktop session/profile endpoint. Do not allow browser `/api/me` by default. |
| Locale/theme persistence and profile label | Browser local preferences / profile storage | No server API required; implementation must account for per-server profile boundaries where server branding/theme differs. |

## Current route-policy boundary

`src/lib/desktop-route-policy.ts` currently allows only projects (`GET`, `POST`, item `PATCH`, `DELETE`), entries (`GET`, `POST`, item `PATCH`, `DELETE`), teams (`GET`), desktop config (`GET`), and desktop logout (`POST`). It rejects extra query parameters except the required `mine=1` entries query. `POST /api/desktop/login` is the anonymous login path and is not a bearer-token route.

## API gap analysis and minimum contract

The existing allowlist supports the core workflow paths, but source review found these contract gaps to close before implementing a shared UI:

| Gap | Current behavior / risk | Minimum safe resolution |
|---|---|---|
| Session/profile bootstrap | Login returns a public user and the config endpoint returns user/config; no dedicated session validation endpoint exists. | Add an allowlisted `GET /api/desktop/session` (or equivalent) returning only the minimal public user/role and session-valid state. This supports startup restore and role navigation without exposing cookie auth or broad `/api/me`. Revoke/deactivate/expiry must continue to fail closed. |
| Team visibility semantics | The contract says teams the user belongs to; verify that `GET /api/teams` is filtered by desktop user's team memberships and returns only the explicit fields. | Enforce membership-scoped selection server-side and return only team id/name/description and active member name/email. Never enable team writes. |
| Project reads | Desktop project GET currently returns all projects for managers and only non-archived projects for standard users; response fields are whitelisted. | Preserve this role distinction only if it matches approved web access; review assignment visibility explicitly. Do not broaden standard-user access. |
| Project mutation responses | `POST /api/projects` returns the raw created Prisma project; `PATCH /api/projects/:id` returns its raw project with included relations. That can expose fields beyond the contract. | For desktop requests, return the same explicit safe project projection as GET, including only fields needed to render; keep web response behavior unchanged if required. Add `Cache-Control: no-store` to all desktop mutation responses. |
| Entry responses | GET maps user name but includes relational project/team fields and database timestamps; POST returns included entry relations. | Define a typed minimal entry DTO for desktop, including only own entry values and allowed project display fields; use it consistently for GET/POST/PATCH. Add no-store to all desktop responses. |
| Desktop locale/error behavior | Login throttling and error localization exist; all resource handlers must be checked for no-store and consistent desktop auth failures. | Ensure every desktop response (including validation/authorization/conflict errors) is no-store and localized without adding sensitive data. Preserve browser response behavior. |
| Route policy for new session endpoint | Current allowlist has no session route. | Add only the exact `GET /api/desktop/session`, forbid query strings and every other method/path, and cover direct-call allow/deny behavior in existing policy integration tests. |

Already satisfied by source review: `GET /api/entries?mine=1` requires the exact query and handlers constrain desktop entries to `me.id`; project role policy rejects User team/archive edits and permits deletion only to Owner/Admin for projects without entries; team writes and all excluded APIs are blocked by the route policy. Each remains a regression requirement.

The resolution must be implemented as desktop-specific response shaping and a narrowly allowlisted session endpoint, not by granting desktop sessions browser-cookie access or exposing general-purpose manager APIs. The packaged desktop frontend remains a reduced panel; shared UI implementation is a later checklist item.

## Explicitly forbidden, regardless of UI visibility

Desktop sessions must not access people/user management, team writes, report/export, backups, account changes, setup/activation, version/update controls, deletion/uninstall, or browser handoff routes. Owner/Admin desktop sessions remain subject to own-entry restrictions. Standard Users cannot set project team/archive state or delete projects. Route visibility is never an authorization boundary.
