# Repo bootstrap audit — 2026-09-27

Ledger for the `repo-bootstrapper` (mdb-tam standard) pass. Read this before re-auditing:
**RETRACTED** findings are off-limits without new evidence; **Deferred** items are the backlog.
Severity: blocking · major · medium · minor.

Baseline: `main` @ `50ffd78` (v1.11.0), clean tree, 4 test files / 95 tests green.
Result: v1.11.1 on branch `chore/repo-bootstrap-2026-09-27`.

## Prior knowledge (memory-central)

`/Users/mitch/.llms/stickysites_{actions,conventions,risks,architecture,facts,sessions}_llms.md`
read first. One open action: *"Confirm canonical clone for stickysites repository"* — the hub
registry pointed at `/Users/mitch.hudson/dev/stickysites`; corrected to
`/Users/mitch/dev/stickysites` (see § Hub). Recorded risk (no Shadow DOM) is still open and
kept in `known-issues.md`. No decisions/lessons files existed.

## Manifest audit

| File | Before | Finding | Severity | Action |
|---|---|---|---|---|
| `.github/copilot-instructions.md` | missing | — | major | **created** (Default Execution Strategy first) |
| `CLAUDE.md` | present | Version said 1.10.0 (repo 1.11.0); permissions listed 3 of 5; `src/shared/todo-bridge.js`, `tests/todo-bridge.test.js`, `scripts/verify-live.mjs` absent from the tree; header "Semantic Indexing Rule" referenced non-existent `scripts/semantic_indexer.py` and a `search_codebase` MCP tool; no workflow log rule / MCP section | major | **rewritten** |
| `AGENTS.md`, `GEMINI.md`, `memory.md`, `prompts.md` | missing | — | major | **created** |
| `docs/archive/` + `scripts/rotate-workflow-logs.mjs` | missing | — | medium | **created** (`npm run logs:rotate`) |
| `.editorconfig`, `.gitignore`, `.gitattributes`, `.nvmrc` | present | compliant (`root = true`; LF; binaries marked; Node 22 = `engines`) | — | none |
| `.env.example` | missing | Only env var in repo is `SS_CHROME` (harness) | minor | **created** |
| `.vscode/launch.json`, `.vscode/mcp.json`, `.mcp.json` | missing | — | medium | **created** (hub server, command only — repo is public) |
| `.github/workflows/test.yml` | present | Tests only; no lint/type gate; no index check | medium | **replaced by `ci.yml`** (lint → test → index check → manifest validation) |
| `.github/dependabot.yml`, `CODEOWNERS`, issue templates | present | compliant | — | none |
| `.github/PULL_REQUEST_TEMPLATE.md` | present | No Rollback section | minor | **updated** |
| `.github/SECURITY.md` | present | No response SLA | minor | **updated** |
| `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` | present | compliant (CONTRIBUTING links DEVELOPMENT) | — | none |
| `README.md` | present | Said v1.8.0; advertised removed bare `1`–`5`/`A` hotkeys and badges; "resizable (bottom-right)"; key "cached in `chrome.storage.session`"; no to-do sync, outliner library, find & replace, Quick-Open | major | **rewritten** |
| `docs/ARCHITECTURE.md` | present | Session-storage key cache (code uses `chrome.storage.local["stickysites_cached_key"]`); 3 permissions; no to-do sync / popout / SPA flows; prefs schema incomplete; digit hotkeys | major | **rewritten** with 8 ADRs |
| `docs/COMPONENTS.md` | present | Line counts from ~v1.7 (panel 793 → 1874, SW 225 → 122); claimed SW/popup use `notes-storage.js` (only tests do); no `todo.js`, `outline*.js`, `todo-bridge.js`, popout | major | **rewritten** from a full API inventory |
| `docs/DEVELOPMENT.md` | present | "42 tests", 5 note types, stale tree | medium | **rewritten** |
| `docs/TESTING.md` | present | "72 tests / 3 files" (95 / 4); no coverage target statement; no CI gates | major | **rewritten** |
| `docs/SECURITY.md` | present | Session-storage key lifecycle wrong; cached-key-on-disk risk absent | major | **rewritten** |
| `docs/INSTALLATION.md` | present | "yellow + green buttons on the right edge" (pre-cluster UI); no host install | medium | **rewritten** |
| `docs/requirements.md` | present | Digit hotkeys, "popout (placeholder)", session key, 3 permissions, vitest 4.x | medium | **rewritten** |
| `docs/integrations-and-assumptions.md` | present | No native host row; "7 scripts" | medium | **rewritten** |
| `docs/known-issues.md` | present | Missing: cached key on disk, `notes-storage.js` drift, popup bypasses Prefs, `panelMode` unused, harness needs Chrome for Testing | medium | **rewritten** (10 entries) |
| `docs/onboarding.md` | present | "48 tests across 2 files" | minor | **rewritten** |
| `docs/external-calls.md` | present | Good inventory of the one call; no five-standard audit, no error/remediation table | medium | **rewritten** |
| `docs/codebase-overview.md` | present | Missing `todo-bridge.js`, `todo-bridge.test.js`, `scripts/verify-live.mjs`, `popout.*`, `.github/`, llms suite; several "—" line counts | major | **rewritten** (every tracked component) |
| `docs/MCP.md`, `docs/logging.md`, `docs/caching-and-optimization.md`, `docs/runbooks/*.md` | missing | — | major | **created** (4 runbooks) |
| `docs/high_signal_file_index.json` | missing | — | major | **created** (65 entries; CI-validated) |
| `scripts/check-doc-indexes.mjs` | missing | — | medium | **created** (`npm run docs:check-indexes`, `--prune`; also checks `llms.txt` links) |
| `scripts/semantic_indexer.py`, `scripts/watch_and_index.sh` | missing | Referenced by the old `CLAUDE.md` header | blocking (dangling reference) | **reference removed**; indexing is provided machine-wide by `global_ai_hub` (`docs/MCP.md`) — per-repo duplicate **Deferred/declined** |
| `server/src/lib/operations-registry.js`, `docs/operations-registry.json`, `docs/tool-inventory.json`, `scripts/generate-ops-registry-doc.mjs` | missing | No server/MCP runtime exists to host them | — | **N/A — documented** in `docs/external-calls.md` § Five-standard audit |
| `llms.txt` suite | present (p/1.1.0, 2026-09-25) | Indexed only 9 docs; `llms-facts.txt` carried three wrong facts (v1.8 README, digit hotkeys, session key) | medium | **regenerated** (24 docs; facts rewritten with `[src:]` to code) |
| `vitest.config.js` | present | ESM syntax in a CJS-loaded file → Vite deprecation warning on every run | minor | **renamed** `.mjs` |

## Extended checks

| Check | Result |
|---|---|
| Dependency audit | `npm audit`: 0 vulnerabilities. `npm outdated`: vitest 5.0.1 → 5.0.2 (patch; Dependabot will open it). `package-lock.json` committed. `engines.node >=22` = `.nvmrc`. |
| Customer data in VCS | None (personal project; `git ls-files` scanned). `.remember/` is git-ignored. |
| Native host manifest | Installed for **Chrome Beta only** (`~/Library/Application Support/Google Chrome Beta/NativeMessagingHosts/com.mitch.todo_bridge.json`); `path` → `~/.claude/skills/todo/scripts/todo_host` (executable, ok). Other browsers need `install-native-host` — documented in the runbook. Not a repo defect. |
| Offscreen document audit (MV3) | No offscreen documents are created. N/A. |
| Auth surface inventory | Single surface: the passphrase vault. Documented (`SECURITY.md`), health check = `stickysites_cached_key` presence, failure mode = lock overlay. No OAuth/cookies/tokens. |
| Agent inventory | No `.claude/agents/` → `AGENTS.md` states none. |
| Skill coverage | Stack (MV3, vanilla JS, vitest, puppeteer, native messaging) covered by installed `chrome-extension-expert`, `lang-js-ts`, `web-dev-practices`, `security-review`. No gap. |
| Logging standard | **Major before**: zero `console.*` calls; ~40 silent `catch` blocks. **After**: service-worker integration boundaries log `console.warn('[stickysites] …')`; the remaining silent catches are inventoried with rationale in `docs/logging.md`. No secrets/PII can reach logs (no logging of bodies/keys). |

## Code findings (cdo pass, scoped)

Scope: `src/shared/*`, `src/background/service-worker.js`, `src/content/outline-ops.js`,
`scripts/*.mjs`, tests — files with a verify gate (`npm run lint && npm test`). Content
scripts, `popup.js`, `popout.js` were reviewed read-only (no UI tests) and their findings are
listed as **Deferred** below.

| # | File | Change | Severity | Verified by |
|---|---|---|---|---|
| C1 | `src/background/service-worker.js` | Removed dead `chrome.storage.session.setAccessLevel(...)` (session storage unused anywhere) | medium | grep; lint |
| C2 | `src/background/service-worker.js` | Clip / toggle `catch {}` → `console.warn('[stickysites] clip'/'toggle', { tabId, noteTypeId, error })`; `runTodoSync` now warns on `{ error }` results and thrown errors; `windows.create` in the popout handler gained a `.catch` (unhandled rejection) | major (logging standard) | lint; manual SW console |
| C3 | `src/shared/crypto.js` | `deriveKey` extractable `false` → `true` and `isEncrypted` rejects `siteKey` — parity with `crypto-content.js` (the ES copy was incompatible with `cacheKey()`'s `exportKey`) | medium | `tests/crypto.test.js` (+2) |
| C4 | `src/shared/notes-storage.js` | `writeTodo`/`readTodo` round-trip `sections` (`[]`) and `tagColors` (`{}`) instead of dropping them; `DEFAULT_PREFS` now equals `prefs.js` | medium | `tests/notes-storage.test.js` (+4) |
| C5 | `scripts/check-syntax.mjs` | `readFileSync` instead of spawning `cat` | minor | lint |
| C6 | `scripts/verify-live.mjs` | Header comment (v1.10 / "untracked") corrected | minor | — |

Gate after the pass: `npm run lint` ✔ 26 files; `npm test` 4 files / **101 tests** (95 → 101).
Reviewed with no Medium+ finding: `todo-bridge.js`, `outline-ops.js`, `check-doc-indexes.mjs`, `rotate-workflow-logs.mjs`.

Advisory (read-only; **Deferred D6**):

| Severity | Location | Problem | Fix |
|---|---|---|---|
| medium | `src/content/todo.js:184-186` | `DragController` adds document `mousemove`/`mouseup` closures per drag start; a `mouseup` outside the window leaves the pair attached | Track the pair and remove before re-adding; end drag on `blur` |
| medium | `src/content/crypto-content.js:97` | `clearCachedKey` swallows `storage.remove` errors | `console.warn('[stickysites] crypto', …)` |
| medium | `src/content/mentions.js:117-151` | `_buildFlatItems` duplicates `_getAllDisplayItems` filtering | Derive one from the other |
| low | `src/content/mentions.js:226-234` | `sel.getRangeAt(0)` without `rangeCount` guard | `if (!sel || !sel.rangeCount) return;` |
| low | `src/shared/todo-bridge.js` | No dedupe if the host returns duplicate item ids | Left: trusted local host; ambiguous which wins |

## Retracted

| # | Finding | Why retracted |
|---|---|---|
| R1 | "Repo fails the five-standard external-call contract → must add `operations-registry.js` + `tam_ops_*` MCP tools" | Standards 1 (CLI/MCP trigger) and 4 (dashboard card) presuppose a server runtime; a Chrome extension has none. Deviation documented in `docs/external-calls.md`. Do not re-raise unless a server is added. |
| R2 | "`chrome.storage.session` key cache must be documented / `setAccessLevel` is required" | Code never used session storage for the key (`crypto-content.js:79-97`); the call was dead and has been removed. Docs now say `chrome.storage.local`. |
| R3 | "Add `scripts/semantic_indexer.py` + `watch_and_index.sh`" | Machine-wide `global_ai_hub` already indexes `~/dev/*`; a per-repo Ollama/Chroma pipeline would duplicate it. Pointer lives in `docs/MCP.md`. |

## Deferred

| # | Item | Severity | Where |
|---|---|---|---|
| D1 | Shadow DOM encapsulation for injected UI | medium | `known-issues.md` |
| D2 | Decide the fate of `src/shared/notes-storage.js` (runtime storage layer vs test fixture) | low | `known-issues.md`, `memory.md` → Next steps |
| D3 | Unlock spinner during PBKDF2 | low | `known-issues.md` |
| D4 | Popup should load `prefs.js` instead of writing prefs directly | low | `known-issues.md` |
| D5 | Remove unused `panelMode` pref (tests round-trip it) | minor | `known-issues.md` |
| D6 | Content-script advisory findings from the cdo read-only pass | see table above | this file |

## Hub

`project_manager.py upsert stickysites --path /Users/mitch/dev/stickysites` — path corrected
from `/Users/mitch.hudson/…`; purpose/remote unchanged; memory-central files attached by the
nightly job / `mcl_run.sh --force`.

## Convergence

Iteration 1: findings above → all manifest gaps closed except the three retracted/N-A rows.
Iteration 2 (re-audit after writes): `npm run lint`, `npm test`, `npm run docs:check-indexes`
green; no medium+ manifest finding remains. Stopped at 2 of 3 allowed iterations.
