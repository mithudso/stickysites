# Integrations and Assumptions

## External services and processes

StickySites has no hosted telemetry. Its optional boundaries are a local native host,
loopback daemon, paired LAN peers, and a shared/cloud folder selected by the user.

| Integration | Purpose | Where | Auth | Failure mode |
|---|---|---|---|---|
| `chrome.storage.local` | All persistence (notes, prefs, crypto config, cached key) | every context | per-extension isolation | Queue rejects failed/unverified writes; readers may show defaults |
| `chrome.runtime.sendNativeMessage` → `com.mitch.todo_bridge` | Two-way to-do sync with the host-configured `TODO.md` | `src/background/service-worker.js` → `src/shared/todo-bridge.js` | Browser-level host manifest (`allowed_origins` must list this extension id) | Host missing/forbidden → `console.warn`, list stays local; malformed reply → nothing written |
| Loopback HTTP → `peer/stickysites-peer.py` | Paired LAN or shared-folder note sync | `peer-sync.js`, popup settings, `network.js` | Local Host/Origin checks; LAN HMAC, bearer, pinned TLS; folder HMAC | Bounded requests; persisted sync status; no helper means no peer sync |
| `chrome.alarms` | To-do and peer sync periods | service worker | — | Sync only runs on startup/edit |
| `chrome.contextMenus`, `chrome.commands`, `chrome.tabs.sendMessage/query`, `chrome.windows.create` | Clip menu, `Alt+S`, popout | service worker, popup | `activeTab` | Tab without a content script → warning, no-op |
| Web Crypto (`crypto.subtle`) | PBKDF2, AES-GCM, JWK import/export | `crypto-content.js`, `crypto.js` | — | Operation errors preserve staged vault state; UI reports failure |

## External tools (development only)

| Tool | Used by | Notes |
|---|---|---|
| Node matching `.nvmrc` and package engines, npm | tests, lint, index check, log rotation | `.nvmrc` = 22 |
| Vitest, jsdom, ESLint, canvas | `npm test`, `npm run icons` | `package.json` devDependencies |
| puppeteer-core + Chrome for Testing | `npm run verify:live`, `npm run store:screenshots` | Optional prerequisite; binary path via `SS_CHROME` for both harnesses |
| Python 3.9+ and OpenSSL | Optional peer daemon and synthetic integration tests | Isolated `STICKYSITES_HOME` in tests |
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
| Shared settings default `clusterLayout: 'vertical'`, all six types enabled | `src/shared/settings.js` | First-run appearance |
| 1 s URL poll detects SPA navigation | `sticky-inject.js` | Up to 1 s lag before re-key |

## Context differences

| Context | Module system | Scripts loaded | Storage | Notes |
|---|---|---|---|---|
| Content scripts (host page) | classic, `window.StickySites.*` | manifest order, including settings/network/storage/HTML safety helpers | `chrome.storage.local` | Only place the cluster, lock overlay, toast, SPA watcher exist |
| Service worker | ES module | imports queue, native/peer sync, crypto, shared settings/network | `chrome.storage.local`, alarms | Owns runtime mutations, `sendNativeMessage`, and `windows.create` |
| Popup page | classic `<script>` | shared settings/network, storage/HTML helpers, crypto/prefs, popup | `chrome.storage.local` | Writes prefs through shared normalization and queued IPC |
| Popout page | classic `<script>` | namespace helpers + `popout.js` (no cluster / inject) | `chrome.storage.local` | Drag-off-page popout disabled (`chrome-extension:` origin) |
| Vitest (node/jsdom) | ES modules and actual classic scripts | `src/shared/*`, `outline-ops.js` with stubbed `window` | synthetic storage/IPC/fetch | jsdom runtime regressions; no live browser activation |

## Environment variables

The browser extension reads no environment variables. `SS_CHROME` selects a binary for
both browser harnesses. `STICKYSITES_HOME` selects peer-daemon state (tests supply temporary
homes). `.env.example` documents these paths; no dotenv loader reads it.

Chrome's local storage quota still applies; this manifest does not request
`unlimitedStorage`. See the [Chrome storage documentation](https://developer.chrome.com/docs/extensions/reference/api/storage#property-local).
A quota or persistence rejection is a failed save. Export/back up data and resolve the
storage problem before retrying; successful UI rendering is not proof of persistence.
