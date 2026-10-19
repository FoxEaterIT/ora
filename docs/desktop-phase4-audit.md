# Desktop Phase 4 audit notes

This document records source-review findings and the validation limits for the remaining Phase 4 gates. It does not claim native UI, assistive-technology, Windows VM, or clean-checkout testing.

## Keyboard, accessibility, and localization

The standalone UI in `src-tauri/index.html` offers English, Italian, and Spanish, chooses a saved locale or browser preference on first use, persists it locally, and synchronizes `ora-locale`. Source review verified all 31 message keys in each locale, including localized theme names. The UI uses native buttons, inputs, and selects and visible `:focus-visible` styling. The account menu supports Escape dismissal, focus to its action, and focus return; Escape dismissal also works from outside the menu. Successful session restoration/login moves focus to project selection, and every transition back to login moves focus to email. The daily total is now announced politely on update and the idle timer label follows the selected locale. The standalone client has login, timer, project selection, recent-entry summary, errors, and appearance flows; it does not implement timesheet editing. Source review does not establish correct focus order, accessible names/states, live announcements for all asynchronous results, or hidden-control reachability in actual assistive technology. No keyboard-only, screen-reader, or native WebView test was performed; those remain outstanding.

## Icon, branding, and metadata

`src-tauri/tauri.conf.json` currently declares product name `Ora Desktop`, window title `Ora Timer`, identifier `com.ora.desktop`, version `0.1.0`, and `src-tauri/icons/icon.ico`. The ICO was checked structurally as a valid single-image 256×256 file, and the owner confirmed visual approval on 2026-10-19. Product metadata was source-reviewed; signing identity has not been validated and remains deferred to distribution.

## Coordinated version policy

The Tauri/Cargo desktop version is `0.1.0` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; the Ora frontend package version is `0.4.0` in `package.json`. `scripts/build-desktop-frontend.mjs` emits both values to `build-info.json`. Keep these semantically distinct: bump the desktop version for every desktop build/release; bump the frontend version only when the Ora frontend package release changes. A desktop release that changes embedded frontend code must include that code in the same desktop release and record both values. Before tagging, verify `tauri.conf.json` and Cargo package versions agree, the generated build-info reports the intended pair, and installer metadata uses the desktop version. Do not bump either version merely for this audit.

## Dependency vulnerability status

On 2026-10-19, `npm audit --json` reported 12 vulnerabilities: 9 high and 3 moderate, 0 critical. The reported affected paths include `eslint-config-next` / `@next/eslint-plugin-next` through `fast-glob`/`micromatch`/`braces`, Prisma through `@prisma/config`/`deepmerge-ts`, Next.js through nested PostCSS, and ExcelJS through `uuid`. npm's suggested fixes include major-version changes (Prisma 7, Next 16, and a downgrade of eslint-config-next/ExcelJS); none were applied. This record is not a risk acceptance. Before distribution, assess runtime versus development exposure and compatibility, choose a supported remediation plan or obtain explicit, time-bounded owner acceptance with a reassessment date, and rerun audit/tests. Do not apply major upgrades without approval.

## Clean-checkout reproducibility

Still unverified. The reproducibility gate must use a disposable fresh checkout/worktree, install strictly from `package-lock.json` (`npm ci`), and start without generated `src-tauri/frontend-dist` or cached `src-tauri/target` artifacts. Record Node/npm, Rust/Cargo, Tauri CLI, WebView2 and Windows prerequisites; run frontend build, TypeScript/i18n/tests as appropriate, Rust tests/check, and the supported bundle build. Do not remove or overwrite the active working tree's files to simulate a clean checkout. Installer execution, native WebView behavior, and clean-VM/account-isolation validation remain distinct checks and must not be inferred from a successful build.
