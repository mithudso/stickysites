# Codebase overview

Every tracked file, grouped by directory. Line counts as of v1.11.1. **G** = generated,
**T** = test-only, **C** = config/meta.

## Root

| File | Lines | Purpose |
|---|---|---|
| `manifest.json` | 45 | MV3 manifest: 5 permissions, `Alt+S` command, 10 content scripts in load order, module service worker, popup action **C** |
| `package.json` / `package-lock.json` | — | Dev deps (vitest, canvas) and npm scripts (`test`, `lint`, `docs:check-indexes`, `logs:rotate`, `icons`, `verify:live`) **C** |
| `vitest.config.mjs` | 8 | Vitest: node environment, globals **C** |
| `popup.html` / `popup.js` / `popup.css` | 48 / 869 / 447 | Browser-action popup: lock screen, settings, Quick-Open, search/sort/filter, export |
| `popout.html` / `popout.js` / `popout.css` | 20 / 41 / 34 | Standalone window hosting the Panel for one note |
| `README.md` | — | Overview, features, quick start, docs table |
| `CLAUDE.md` | — | Canonical agent guide (shape, commands, conventions, storage keys, workflow log rule) |
| `AGENTS.md` / `GEMINI.md` | — | Agent catalog (none repo-local) / Gemini pointer to `CLAUDE.md` |
| `memory.md` / `prompts.md` | — | Versioned operator log / request log (rotate with `npm run logs:rotate`) |
| `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` / `LICENSE` | — | Community files (MIT) |
| `llms.txt` / `llms-full.txt` / `llms-small.txt` / `llms-facts.txt` | — | LLM context suite: index, concatenated docs, abstracts, sourced facts **G** |
| `.editorconfig` / `.gitattributes` / `.gitignore` / `.nvmrc` (22) | — | Editor + VCS hygiene **C** |
| `.env.example` | — | Documents `SS_CHROME` (harness only; no runtime env vars) **C** |
| `PRIVACY.md` | — | Public privacy policy linked from the Chrome Web Store listing |
| `.mcp.json` | — | `global_ai_hub` MCP server for Claude Code (developer tooling, not the extension) **C** |

## `src/background/`

| File | Lines | Purpose |
|---|---|---|
| `service-worker.js` | 122 | ES module. Context menus (6 clips), `Alt+S` command, popout `windows.create`, to-do sync scheduler (`chrome.alarms` 2 min + 3 s debounce) calling `runtime.sendNativeMessage` |

## `src/content/` — classic scripts, manifest load order

| # | File | Lines | Namespace / purpose |
|---|---|---|---|
| 1 | `crypto-content.js` | 197 | `Crypto`: PBKDF2 + AES-GCM, `isEncrypted`, enable/unlock/disable, cached key in `stickysites_cached_key` |
| 2 | `note-types.js` | 114 | `noteTypes`: 6 descriptors with storage keys, key/label/icon functions |
| 3 | `prefs.js` | 25 | `Prefs`: read/write `stickysites_prefs_v1` |
| 4 | `cluster.js` | 271 | `Cluster`: floating pill, drag, long-press reorder, layout, identity icons |
| 5 | `todo.js` | 198 | `Todo`: item/section normalisation, colors, drag controller |
| 6 | `outline-ops.js` | 275 | `OutlineOps`: pure tree operations, filter, auto-group, Markdown/OPML export |
| 7 | `outline.js` | 800 | `Outline`: named-doc library, switcher, ⋯ menu, keyboard nav, zoom, lock notice |
| 8 | `mentions.js` | 262 | `Mentions`: `@` autocomplete (link, date, contact, file) |
| 9 | `panel.js` | 1874 | `Panel`: moveable/resizable panel, rich-text toolbar, find & replace, to-do UI, auto-save, cross-tab sync, popout |
| 10 | `sticky-inject.js` | 295 | Orchestrator: init, lock overlay, toast, clip, `Ctrl/Cmd+F1…F6`, SPA watcher, message + storage listeners |
| — | `sticky-inject.css` | 1156 | All injected styles (also linked by `popout.html`) |

## `src/shared/` — ES modules

| File | Lines | Purpose |
|---|---|---|
| `todo-bridge.js` | 137 | Native-messaging to-do sync: `buildRequest`, `applyHostResult`, `syncTodosWithHost` (SW + tests) |
| `peer-sync.js` | ~200 | Local peer sync: snapshot build, vault compatibility, record-level LWW merge with tombstones, `syncWithDaemon` round-trip (SW + tests) |
| `crypto.js` | ~78 | ES twin of `crypto-content.js` primitives + `importJwk` (tests, SW peer merge) |
| `notes-storage.js` | 363 | Reference plaintext CRUD for all six note types + prefs, `parseTags`, `createDebouncedSaver` (tests only; runtime talks to storage directly) |

## `tests/` — vitest, node environment **T**

| File | Lines | Tests | Covers |
|---|---|---|---|
| `notes-storage.test.js` | 377 | 50 | Keys (`getSiteKey`, `getPageKey`, `getDailyKey`), `parseTags`, CRUD for all six types, prefs |
| `peer-sync.test.js` | ~230 | 24 | Snapshot shape, vault compatibility matrix, LWW merge (newer/older/tie/legacy/3 peers), tombstones, `syncWithDaemon` with fake daemon + fake crypto (no-daemon, disabled, apply, self-echo, locked, same-salt merge, mismatch, adopt, remote-off, tombstone propagation) |
| `todo-bridge.test.js` | 190 | 23 | Request shape, host-result merge (sections, local-only fields, `completedAt`), encrypted skip, error paths |
| `outline-ops.test.js` | 184 | 21 | Tree ops, filter, auto-group, Markdown/OPML |
| `crypto.test.js` | 56 | 7 | Salt, key derivation, round-trip, wrong key, `isEncrypted` |

## `peer/` — local peer-sync daemon

| File | Purpose |
|---|---|
| `stickysites-peer.py` | Stdlib Python daemon: loopback API for the extension, LAN HTTPS relay, multicast discovery, launchd install |
| `test_peer.py` | Two-daemon end-to-end test (`npm run test:peer`; CI) **T** |
| `README.md` | Design, install, merge + encryption rules, security model, troubleshooting |

## `scripts/`

| File | Lines | Purpose |
|---|---|---|
| `check-syntax.mjs` | ~60 | `npm run lint` — `node --check` all scripts + version agreement |
| `check-doc-indexes.mjs` | ~110 | `npm run docs:check-indexes` — validate `docs/high_signal_file_index.json`, `llms.txt` links; `--prune` |
| `rotate-workflow-logs.mjs` | ~170 | `npm run logs:rotate` — archive old `memory.md` / `prompts.md` sections |
| `generate-icons.js` | 44 | `npm run icons` — icon PNGs via `canvas` |
| `verify-live.mjs` | 464 | `npm run verify:live` — puppeteer-core end-to-end harness (Chrome for Testing) |
| `build-store-zip.mjs` | ~50 | `npm run build:store` — Chrome Web Store package in `dist/`, runtime files only |
| `store-screenshots.mjs` | ~190 | `npm run store:screenshots` — seeds a throwaway profile and captures 5 × 1280×800 listing screenshots |
| `store-promo.mjs` | ~90 | `npm run store:promo` — 440×280 and 1400×560 promo tiles via canvas |

## `docs/`

| File | Purpose |
|---|---|
| `ARCHITECTURE.md` | Contexts, data flows, load order, storage schema, permissions, ADRs |
| `COMPONENTS.md` | Per-module API reference |
| `DEVELOPMENT.md` | Setup, commands, conventions, debugging |
| `TESTING.md` | Suites, coverage target, CI gates, live harness |
| `SECURITY.md` | Threat model, permissions audit, encryption lifecycle |
| `INSTALLATION.md` | Install / update / uninstall, optional to-do host |
| `requirements.md` | Functional / non-functional requirements, dependencies |
| `MCP.md` | No shipped server; `global_ai_hub` developer server |
| `logging.md` | Console-only diagnostics, silent-failure inventory, sensitive-data rules |
| `caching-and-optimization.md` | Cache layers, debounce/detection patterns, bottlenecks, profiling |
| `external-calls.md` | The native-messaging call and its five-standard audit |
| `integrations-and-assumptions.md` | Chrome APIs, external tools, hardcoded assumptions, context differences |
| `known-issues.md` | Open limitations and gotchas |
| `onboarding.md` | Zero-to-contributing walkthrough |
| `codebase-overview.md` | This file |
| `high_signal_file_index.json` | Machine-readable per-file index (validated by `npm run docs:check-indexes`) **G** |
| `repo-bootstrap-audit-2026-09-27.md` | Standards audit ledger (findings, retractions, deferrals) |
| `runbooks/load-and-reload-extension.md` · `release-packaging.md` · `todo-sync-troubleshooting.md` · `encryption-lock-and-recovery.md` · `peer-sync.md` | Operational procedures |
| `archive/` | Rotated workflow-log sections |
| `superpowers/specs/*.md` · `superpowers/plans/*.md` | Historical design specs and implementation plans (phases 1–5, to-do overhaul, note identity + outliner) |

## `store/` — Chrome Web Store kit

| File | Purpose |
|---|---|
| `README.md` | Submission checklist: every asset, its spec, status, and the dashboard walkthrough |
| `listing.md` | Paste-ready store listing, privacy-tab answers, reviewer notes |
| `permissions-justifications.md` | One justification per permission + host permission + remote code |
| `screenshots/01…05.png` | 1280×800 listing screenshots **G** |
| `promo/small-tile-440x280.png`, `promo/marquee-1400x560.png`, `promo/icon-128.png` | Promo tiles and store icon **G** |

## `.github/`

| File | Purpose |
|---|---|
| `workflows/ci.yml` | lint → test → peer daemon test → index check → manifest validation on push/PR to `main` |
| `copilot-instructions.md` | Copilot rules (mirrors `CLAUDE.md`) |
| `dependabot.yml` | Weekly npm updates |
| `CODEOWNERS` | `@mithudso` |
| `PULL_REQUEST_TEMPLATE.md` | What / Why / Tests / Risk / Rollback |
| `ISSUE_TEMPLATE/bug_report.md` · `feature_request.md` | Issue templates |
| `SECURITY.md` | Reporting channel and response SLA |

## `.vscode/`

`settings.json` (format on save, 2 spaces, 100-col ruler), `extensions.json` (prettier,
editorconfig, vitest), `launch.json` (vitest current file / all, live harness), `mcp.json`
(`global_ai_hub`).

## `icons/`

`icon16.png`, `icon48.png`, `icon128.png` — regenerated by `npm run icons` **G**.
