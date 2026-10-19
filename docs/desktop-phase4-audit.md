# Desktop Phase 4 audit notes

This document records source-review findings and the validation limits for the remaining Phase 4 gates. It does not claim native UI, assistive-technology, Windows VM, or clean-checkout testing.

## Keyboard, accessibility, and localization

The standalone UI in `src-tauri/index.html` now offers English, Italian, and Spanish, choosing a saved locale or the browser preference on first use, persisting it locally, and synchronizing `ora-locale`. The UI uses native buttons, inputs, and selects and has visible `:focus-visible` styling. The account menu has Escape, focus, and outside-click handling. A systematic keyboard/accessibility and translation review remains necessary across login, timer, project, timesheet, and error flows. In particular, validate focus order and return, accessible names/states, live announcements for asynchronous results, translation completeness, and whether hidden controls remain keyboard reachable. Source inspection/build is not a substitute for keyboard-only, screen-reader, or native WebView testing; those remain release validation work.

## Icon, branding, and metadata

`src-tauri/tauri.conf.json` currently declares product name `Ora Desktop`, window title `Ora Timer`, identifier `com.ora.desktop`, version `0.1.0`, and `src-tauri/icons/icon.ico`. The ICO has previously been checked structurally as a valid single-image 256×256 file, but the artwork has not received visual/product approval. Review the artwork at actual Windows taskbar, title-bar, and installer sizes, then decide whether to replace it and align product naming across app, installer, and documentation. Do not claim signing identity validation; signing is deferred to distribution.

## Coordinated version policy

The Tauri/Cargo desktop version is `0.1.0` in `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`; the Ora frontend package version is `0.4.0` in `package.json`. `scripts/build-desktop-frontend.mjs` emits both values to `build-info.json`. Keep these semantically distinct: bump the desktop version for every desktop build/release; bump the frontend version only when the Ora frontend package release changes. A desktop release that changes embedded frontend code must include that code in the same desktop release and record both values. Before tagging, verify `tauri.conf.json` and Cargo package versions agree, the generated build-info reports the intended pair, and installer metadata uses the desktop version. Do not bump either version merely for this audit.

## Dependency vulnerability status

On 2026-10-19, `npm audit --json` reported 12 vulnerabilities: 9 high and 3 moderate, 0 critical. The reported affected paths include `eslint-config-next` / `@next/eslint-plugin-next` through `fast-glob`/`micromatch`/`braces`, Prisma through `@prisma/config`/`deepmerge-ts`, Next.js through nested PostCSS, and ExcelJS through `uuid`. npm's suggested fixes include major-version changes (Prisma 7, Next 16, and a downgrade of eslint-config-next/ExcelJS); none were applied. This record is not a risk acceptance. Before distribution, assess runtime versus development exposure and compatibility, choose a supported remediation plan or obtain explicit, time-bounded owner acceptance with a reassessment date, and rerun audit/tests. Do not apply major upgrades without approval.

## Clean-checkout reproducibility

Still unverified. The reproducibility gate must use a disposable fresh checkout/worktree, install strictly from `package-lock.json` (`npm ci`), and start without generated `src-tauri/frontend-dist` or cached `src-tauri/target` artifacts. Record Node/npm, Rust/Cargo, Tauri CLI, WebView2 and Windows prerequisites; run frontend build, TypeScript/i18n/tests as appropriate, Rust tests/check, and the supported bundle build. Do not remove or overwrite the active working tree's files to simulate a clean checkout. Installer execution, native WebView behavior, and clean-VM/account-isolation validation remain distinct checks and must not be inferred from a successful build.
