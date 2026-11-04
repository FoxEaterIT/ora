# Ora Desktop independent security review checklist

Status: assistant source review prepared 2026-11-04. This is a review aid, not an independent security approval, penetration test, or release sign-off. Findings below are based on source inspection only; verify them against the exact release commit and supported Windows builds.

## Review scope

Review the desktop client, its server-side desktop API boundary, credential/session handling, packaging workflow, and release metadata against [`desktop-security-contract.md`](desktop-security-contract.md). The client is a security boundary only in combination with server authorization; do not treat hidden controls or the client allowlist as server enforcement.

Primary files:

- `src-tauri/desktop-api.ts`, `src-tauri/index.html`, `src-tauri/profile-state.ts`, `src-tauri/session-flow.ts`
- `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `src-tauri/permissions/session.toml`, `src-tauri/tauri.conf.json`
- `src/lib/desktop-route-policy.ts`, `src/lib/desktop-auth.ts`, `src/lib/desktop-session.ts`, `src/lib/desktop-login-throttle.ts`
- `src/app/api/desktop/**`, `src/app/api/projects/**`, `src/app/api/entries/**`, `src/app/api/teams/**`
- `.github/workflows/desktop-release.yml`, `scripts/build-desktop-frontend.mjs`

## Static-review observations to verify

These are questions/findings for the independent reviewer, not claims of exploitable vulnerabilities:

1. **Login throttle client-IP trust (medium priority to verify).** `src/app/api/desktop/login/route.ts` uses the first `X-Forwarded-For` value directly, while its comment assumes a trusted local reverse proxy. Confirm supported deployments strip/overwrite client-supplied forwarding headers and cannot reach the app directly. If that assumption is not enforceable, use a trusted proxy-derived address or another bounded throttle key so attackers cannot trivially rotate spoofed values.
2. **Desktop project visibility versus contract (verify semantics).** `GET /api/projects` in `src/app/api/projects/route.ts` returns all non-archived projects to non-managers; the contract says “projects the user may see.” Confirm this matches the intended web/product visibility and does not expose metadata for projects outside the user's membership/access. Add an explicit test or tighten the query if membership is intended to scope visibility.
3. **Release workflow supply-chain controls.** `.github/workflows/desktop-release.yml` runs on manual dispatch, checks out the supplied tag, and uses write permission to upload assets. Verify who can dispatch it, protect release tags, review the exact tagged source before dispatch, pin third-party actions to immutable commit SHAs per repository policy, and confirm reruns/`--clobber` cannot attach artifacts to an unintended release. The workflow itself does not establish publisher authenticity for the unsigned installers; published hashes are transport checks, not independent signatures.
4. **Credential and WebView behavior needs runtime proof.** Source shows fixed Tauri keyring commands, per-origin hashed account identifiers, `redirect: 'error'`, a token header, CSP hashes, and disabled devtools in packaged config. Verify in WebView2/Windows that redirects are rejected before forwarding credentials, keyring data is per Windows account and cleared as intended, no token/password appears in logs, storage, URLs, crash output, or network diagnostics, and CSP blocks injected script/style/network paths.
5. **HTTP origin trust is an explicit downgrade risk.** HTTP is allowed after per-origin confirmation and approval is stored in WebView local storage. Confirm the UI makes this persistent unencrypted transport risk clear, approval is origin-specific, switching profiles cannot carry tokens across origins, and the threat is acceptable for the release audience. Prefer HTTPS in deployment guidance.
6. **Rate limiting and operational exposure.** Confirm throttle storage growth/cleanup, concurrent failures, proxy behavior, and denial-of-service characteristics under real deployment load. Current progressive delay is per hashed IP/email and has no permanent lockout, as designed.
7. **API enforcement and data minimization.** Independently exercise every allowed and forbidden method/path with desktop tokens, cookie sessions, mixed credentials, query strings, malformed IDs/bodies, each role, and cross-user entry IDs. Verify no-store on every desktop response and errors, explicit safe DTO fields, team membership scoping, and project/member authorization. Ensure unknown routes cannot fall through to cookie authentication.
8. **Untrusted data rendering.** Verify project/team/member strings remain text in every Tauri view and are not interpolated into HTML, URLs, CSS, or logs unsafely. Exercise malicious markup and control characters.

## Independent reviewer procedure

- [ ] Record reviewer, date, repository commit SHA, target release/tag, OS/WebView2 versions, and tools used.
- [ ] Read the security contract and release checklist; resolve each observation above with evidence and severity.
- [ ] Review all primary files and relevant auth/access/schema/migration code, not only this summary.
- [ ] Run focused tests plus `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run check:i18n`, `npm run desktop:build:frontend`, and Rust tests/checks; record exact commands and results.
- [ ] Test the API allowlist and roles with direct HTTP requests, including routes not exposed in UI and cookie-plus-desktop-token cases.
- [ ] Test origins, URL normalization, HTTP approval, profile switching, redirects, failed/offline logout, stale requests, and per-origin keyring isolation on Windows.
- [ ] Inspect packaged artifacts and runtime logs/storage/network traces for secrets; verify CSP and Tauri capability boundaries with actual packaged WebView2.
- [ ] Inspect GitHub Actions permissions, tag protections, action pinning, build provenance, output naming, checksum generation, and release attachment behavior. Do not dispatch or publish without the owner's approval.
- [ ] Classify findings (severity, impact, reproducibility, affected versions), distinguish confirmed issues from assumptions, and record remediation/accepted risks with owner approval.
- [ ] Sign off only after outstanding findings are resolved or explicitly accepted and all required release gates have evidence.

## Assistant source-review record (2026-11-04)

Reviewed the security contract/checklist, desktop API transport and route policy, desktop session/login implementation, project/entry/team handlers, Tauri capability/keyring/configuration, profile/session helpers, frontend build script, and manual release workflow. Source inspection supports the intended separation of server-enforced desktop authorization, hashed session tokens, fixed keyring commands, per-origin token lookup, redirect rejection, and manual installer publication. The review identified the two questions above (forwarded-IP trust and project visibility) for independent confirmation; no runtime assurance or independent approval is claimed. GitHub workflow execution, clean-checkout reproducibility, native Windows/WebView2/keyring tests, and artifact/log inspection were not performed.
