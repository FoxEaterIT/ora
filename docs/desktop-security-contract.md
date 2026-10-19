# Ora Desktop security and product contract

Status: approved 2026-10-17. This is the Phase 1 contract for the Windows desktop client. It does not by itself make the current preview releasable. Later phases implement and test these rules; desktop server sessions are now durable, but the preview remains non-releasable until all gates pass.

## 1. Platform and deployment

| Decision | Rule |
|---|---|
| Client | Windows 10 and Windows 11, WebView2 (Tauri 2). No other OS in the first release. |
| Server | One updated Ora instance with persistent SQLite. Multi-instance hosting is out of scope and must not be assumed. |
| Installer | Standalone Windows installer, built for each GitHub release. First release may be unsigned. Publish a checksum and verification instructions. SmartScreen warnings are accepted for that release. |
| Delivery | Authenticated Ora users download the installer from the web app. The server installer also supplies the desktop client configuration, including the preconfigured server URL. |
| Updates | Manual download and install only. No automatic desktop updater in the first release. |
| Secrets | The client configuration contains no server secrets: no passwords, `AUTH_SECRET`, database credentials, or signing keys. |

The server URL is installation configuration. Do not rebuild the installer once per Ora server.

## 2. Desktop API allowlist

A desktop session is the header `x-ora-desktop-token`. It is not a browser cookie and must not create one. Every allowed route checks the token on the server. Hiding UI is not authorization. Any other method or path returns 403 and does not fall through to cookie authentication.

Entries are always the signed-in user's rows, including when that user is Owner or Admin. Desktop never lists, edits, or deletes another person's time.

| Method and path | Who | What the client may do |
|---|---|---|
| `POST /api/desktop/login` | Anonymous | Email and password. Returns the opaque token once, plus the public user profile. `Cache-Control: no-store`. |
| `POST /api/desktop/logout` | Desktop session | Revokes that session. |
| `GET /api/desktop/config` | Desktop session | Non-secret branding and theme settings. See section 5. |
| `GET /api/projects` | Any role | Projects the user may see. Response fields are whitelisted. |
| `POST /api/projects` | Any role | Create a project and its initial members, using the same membership rules as the web app. |
| `PATCH /api/projects/:id` | Any role | Update name, description, color, and members. Owner and Admin may also set team and archive state. |
| `DELETE /api/projects/:id` | Owner, Admin | Delete only when the project has no time entries. |
| `GET /api/teams` | Any role | Teams the user belongs to: id, name, description, and each active member's name and email. |
| `GET /api/entries?mine=1` | Any role | Own entries only. `mine=1` is required. |
| `POST /api/entries` | Any role | Start or add an own entry on an allowed project. |
| `PATCH /api/entries/:id` | Any role | Edit an own entry, including start, stop, description, and project. |
| `DELETE /api/entries/:id` | Any role | Delete an own entry. |

Forbidden to every desktop session, regardless of role: people management, team create/update/delete, reports and export, backup, account email or password changes, setup, version and update controls, and the browser handoff routes. A standard user still cannot assign a project team or archive or delete a project.

Project list fields: id, name, description, color, archived, team id and name, member id plus name and email, and whether the project has time entries (so the client can disable deletion). Do not add password hashes, deactivation internals, or unrelated user fields.

Team list fields: id, name, description, and active members' names and emails. Team color and project counts are unnecessary for this client. Members who are deactivated are omitted.

## 3. Sessions

| Decision | Rule |
|---|---|
| Storage | Durable SQLite table. Process memory is not acceptable. |
| Token | At least 32 random bytes, returned once. Store only a hash. Never store or log the raw token. |
| Lifetime | Absolute 30 days from issuance. No refresh and no sliding extension. |
| Devices | One desktop session per user. A new login revokes the previous desktop session. Browser sessions are separate and are not revoked by desktop login. |
| Logout | Revokes the presented session. The client also deletes its local token when the server cannot be reached. |
| Password | Revoke all of that user's desktop sessions on self-service password change, owner password reset, and any write that changes `passwordHash`. |
| Deactivation | Reject login and revoke that user's desktop sessions. Existing tokens stop working. |
| Role change | Revoke that user's desktop sessions. The user signs in again under the new role. |
| Expiry | Lookup rejects expired and revoked rows. Cleanup may delete them later; it is not required for correctness. |

Login errors for an unknown email, a wrong password, a missing password, and a deactivated account use the same non-enumerating response. The pending owner account cannot sign in until setup is complete.

## 4. Login throttling and logging

Failed desktop logins use progressive delay keyed by client IP and account email. Delay increases across repeated failures and resets after success. The first release does not need a permanent lockout.

Security logs may record the event name, timestamp, and a non-reversible account identifier. They must not record the password, the raw desktop token, or the full email address.

## 5. Client configuration and branding

After each successful login, and again on every launch while the session is valid, the client reads `GET /api/desktop/config`.

Allowed fields are the public branding and theme values already exposed to the web client: application name, tagline, description, light and dark logo paths under `/custom/`, default theme, available light presets, theme labels and colors, and the project and team color palettes. Logo values remain validated `/custom/...` paths, never arbitrary URLs.

The response must omit secrets and server-only settings such as `AUTH_SECRET`, owner credentials, session signing parameters, database URLs, and updater credentials.

The installer-provided server URL is not part of this payload. The user can change it in the client. HTTPS is allowed. HTTP is allowed for a LAN server, but each new HTTP origin requires an explicit confirmation that the network is trusted. The confirmation is remembered per origin. Credentials embedded in the URL, unexpected paths, queries, and fragments are rejected. The token is sent only to the confirmed origin and is not forwarded to another host.

## 6. Token storage on the PC

Store only the opaque desktop token, using Windows Credential Manager with DPAPI. Do not use localStorage, sessionStorage, or a plaintext file. Do not persist the password. Clear the password field after submit. Do not place the token or password in the window URL, navigation history, logs, crash reports, or telemetry.

App data is per Windows user. Sign-out deletes the token even if revocation fails because the server is offline. An expired, revoked, or rejected token is deleted and the client returns to the login screen.

## 7. Distribution threats

| Threat | Required control |
|---|---|
| Stolen token | Hash at rest, 30-day absolute lifetime, single session, revocation on the events in section 3, OS-protected storage. |
| Replay | HTTPS when available. HTTP only after per-origin confirmation. No token in URLs. Logout and expiry reject reuse. |
| CSRF and CORS | Desktop requests use the token header, not cookies. Cookie-authenticated browser routes refuse this header. |
| Malicious project or team text | Render as text. Do not interpret names or descriptions as HTML. |
| Compromised or altered installer | Publish a checksum with the unsigned first release and document how to verify it before running the installer. |
| Downgrade | No automatic updater. Manual install only, so a server cannot silently push an older client. |

## 8. What this contract does not implement

Session tables, endpoint enforcement, native credential storage, packaging, and release tests belong to later phases. Until those gates pass, the Tauri app stays a preview and must not be shipped in the Ora installer or attached to a release as a supported client.
