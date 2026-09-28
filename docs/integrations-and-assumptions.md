# Integrations and Assumptions

## External services and processes

StickySites makes **no network calls**. Its integrations are browser APIs plus one optional
local process.

| Integration | Purpose | Where | Auth | Failure mode |
|---|---|---|---|---|
| `chrome.storage.local` | All persistence (notes, prefs, crypto config, cached key) | every context | per-extension isolation | Extension non-functional; reads return defaults |
| `chrome.runtime.sendNativeMessage` → `com.mitch.todo_bridge` | Two-way to-do sync with `~/dev/personal/Areas/todo/TODO.md` | `src/background/service-worker.js` → `src/shared/todo-bridge.js` | Browser-level host manifest (`allowed_origins` must list this extension id) | Host missing/forbidden → `console.warn`, list stays local; malformed reply → nothing written |
| `chrome.alarms` | 2-minute sync period | service worker | — | Sync only runs on startup/edit |
| `chrome.contextMenus`, `chrome.commands`, `chrome.tabs.sendMessage/query`, `chrome.windows.create` | Clip menu, `Alt+S`, popout | service worker, popup | `activeTab` | Tab without a content script → warning, no-op |
| Web Crypto (`crypto.subtle`) | PBKDF2, AES-GCM, JWK import/export | `crypto-content.js`, `crypto.js` | — | Encryption unavailable (never on supported Chrome) |

## External tools (development only)

| Tool | Used by | Notes |
|---|---|---|
| Node ≥ 22, npm | tests, lint, index check, log rotation | `.nvmrc` = 22 |
| vitest 5.x, canvas 3.x | `npm test`, `npm run icons` | `package.json` devDependencies |
| puppeteer-core + Chrome for Testing | `npm run verify:live` | Not in `package.json`; branded Chrome 137+ ignores `--load-extension`; path via `SS_CHROME` |
| Python 3 + `~/.claude/skills/todo/scripts/todo.py` | native host install and runtime | Outside this repo |
| `global_ai_hub` MCP server | semantic search while developing | `.mcp.json`; optional |

## Hardcoded assumptions

| Assumption | Location | Impact if wrong |
|---|---|---|
| Native host name `com.mitch.todo_bridge` | `src/shared/todo-bridge.js` (`TODO_HOST`) | Sync silently stays local |
| Host manifest path `~/Library/Application Support/<Browser>/NativeMessagingHosts/` (macOS) | `todo.py install-native-host` | Other OSes need their own install path |
| Host sections named `From braindumps` / `Sessions · …` are host-owned | `todo-bridge.js` `isHostSection` | Renamed host sections would be treated as user sections (kept when empty) |
| Content scripts run at `document_idle` on `<all_urls>` | `manifest.json` | Cluster may inject before late DOM; none on `chrome://` pages |
| z-index near 2³¹ beats host overlays | `sticky-inject.css` | Cluster hidden behind hosts that also use max z-index |
| Panel min size 350×250, expand width 900, popout window 1400×1100 | `panel.js`, `service-worker.js` | Cosmetic |
| PBKDF2 600,000 iterations | both crypto files | Changing it invalidates existing vaults (salt + verify token would no longer match) |
| Prefs default `clusterLayout: 'vertical'`, all six types enabled | `prefs.js` | First-run appearance |
| 1 s URL poll detects SPA navigation | `sticky-inject.js` | Up to 1 s lag before re-key |

## Context differences

| Context | Module system | Scripts loaded | Storage | Notes |
|---|---|---|---|---|
| Content scripts (host page) | classic, `window.StickySites.*` | all 10 in manifest order | `chrome.storage.local` | Only place the cluster, lock overlay, toast, SPA watcher exist |
| Service worker | ES module | imports `src/shared/todo-bridge.js` | `chrome.storage.local`, alarms | Only place `sendNativeMessage` and `windows.create` are called |
| Popup page | classic `<script>` | `crypto-content.js`, `popup.js` | `chrome.storage.local` | Writes prefs directly (no `prefs.js`) |
| Popout page | classic `<script>` | 8 namespace scripts + `popout.js` (no cluster / inject) | `chrome.storage.local` | Drag-off-page popout disabled (`chrome-extension:` origin) |
| Vitest (node) | ES modules | `src/shared/*`, `outline-ops.js` with stubbed `window` | in-memory mock | No DOM |

## Environment variables

None at runtime. `SS_CHROME` is read only by `scripts/verify-live.mjs` (`.env.example`).
