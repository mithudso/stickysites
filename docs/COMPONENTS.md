# Components

Line counts as of v1.11.1. "Namespace" = the `window.StickySites.*` object a classic content
script attaches; "Exports" = ES module exports.

## Service worker — `src/background/service-worker.js` (122 lines, ES module)

Imports `todo-bridge.js` (to-do sync), `peer-sync.js` (LAN sync), `crypto.js` (`importJwk`, `encrypt`, `decrypt` for the peer merge).

| Responsibility | Detail |
|---|---|
| Context menus | `onInstalled`: parent `stickysites-parent` (selection context) + children `clip-global/site/page/todo/outline/daily`; `onClicked` → `tabs.sendMessage(STICKYSITES_CLIP)` |
| Command | `toggle-cluster` (`Alt+S`) → `STICKYSITES_TOGGLE` to the active tab |
| Popout | `onMessage(STICKYSITES_POPOUT)` → `windows.create(popout.html?type&key&label, popup, 1400×1100)` |
| To-do sync | `runTodoSync()` with a `todoSyncRunning` guard; alarm `stickysites-todo-sync` every 2 min; `onStartup`, `onInstalled`; 3 s after `storage.onChanged` touches `stickysites_todos_v1` |
| Peer sync | `runPeerSync()` with a `peerSyncRunning` guard; alarm `stickysites-peer-sync` every 1 min; `onStartup`, `onInstalled`; 4 s after a note / tombstone / crypto change or the enable toggle; `STICKYSITES_PEER_SYNC_NOW` from the popup replies with the persisted state. `peerCryptoApi()` turns the cached JWK into `{ decrypt, encrypt }` for the merge |
| Failure paths | `console.warn('[stickysites] …')` when a tab has no content script, the native host fails, or the peer daemon errors (the "no daemon" case is logged once per outage) |

---

## `src/content/crypto-content.js` (197) — `StickySites.Crypto`

| Method | Purpose |
|---|---|
| `generateSalt()` | 16 random bytes |
| `deriveKey(passphrase, salt)` | PBKDF2-SHA256 × 600,000 → AES-GCM-256 `CryptoKey` (extractable, so it can be cached as JWK) |
| `encrypt(key, text)` / `decrypt(key, envelope)` | 12-byte IV; `{ iv, data }` base64 envelope |
| `isEncrypted(v)` | string `iv` + `data`, and no `body` / `items` / `siteKey` |
| `isEnabled()` / `getConfig()` | Read `stickysites_crypto_v1` |
| `cacheKey(key)` / `getCachedKey()` / `clearCachedKey()` | JWK in `chrome.storage.local["stickysites_cached_key"]` + in-memory `_cachedKey` |
| `enable(passphrase)` | Salt, verify token, config write, cache key, `_encryptAllNotes` |
| `unlock(passphrase)` | Derive, check against `verify`, cache; returns boolean |
| `disable()` | `_decryptAllNotes`, remove config, clear key |
| `encryptValue(v)` / `decryptValue(v)` | Pass-through when no cached key |

Storage: `stickysites_crypto_v1`, `stickysites_cached_key`, the six note keys.

## `src/content/note-types.js` (114) — `StickySites.noteTypes` (array of 6)

Each descriptor: `id, color, tint, tintText, label, emoji, cssClass, storageKey,
storagePattern, getKey(location), getLabel(location), getPlaceholder()`; site/page/daily add
`getIconContent()` / `getIconTitle()` (first 4 domain chars · last path segment (3 chars + …) ·
day of month).

| id | storageKey | pattern | getKey |
|---|---|---|---|
| global | `stickysites_global_v1` | single | `'__global__'` |
| site | `stickysites_sites_v1` | map | hostname without `www.` |
| page | `stickysites_pages_v1` | map | origin + pathname |
| todo | `stickysites_todos_v1` | structured | `'__global__'` |
| outline | `stickysites_outlines_v1` | structured | `''` (renderer resolves the doc) |
| daily | `stickysites_daily_v1` | map | `YYYY-MM-DD` |

## `src/content/prefs.js` (25) — `StickySites.Prefs`

`read()` → defaults merged with `stickysites_prefs_v1`; `write(updates)` → shallow merge, returns
merged prefs or `null`. Defaults: `clusterPosition {x:null,y:null}`, `panelMode 'fixed'`
(unused), `clusterLayout 'vertical'`, `iconOrder null`, `enabledTypes` (all six true),
`panelSize null`, `panelPosition null`. `activeOutlineId` is written by `outline.js` /
`sticky-inject.js` without a default.

## `src/content/cluster.js` (271) — `StickySites.Cluster`

| Method | Purpose |
|---|---|
| `init(noteTypes, onIconClick)` | Build icons in `iconOrder`, apply `clusterLayout`, `clusterPosition`, `enabledTypes`; wire drag + long-press (400 ms) reorder |
| `setActive(typeId)` | Toggle `is-active` |
| `refreshIcons()` | Recompute identity icon text/titles (called on SPA navigation) |
| `getVisibleIcons()` / `getVisibleTypeIds()` | Icons not `display:none` |
| `toggle()` | Hide/show; on hide deactivates and calls `onIconClick(null)` |
| `applyLayout(layout)` | Toggle `is-horizontal` live (popup settings) |

Writes prefs `iconOrder`, `clusterPosition`. DOM: `#stickysites-cluster`, `.stickysites-cluster-icon`.

## `src/content/todo.js` (198) — `StickySites.Todo`

`COLORS` (8 swatches), `PRIORITY_COLORS` (1–5), `genId()`, `normalizeItem(item)` →
`{ id, text, done, indent 0–3, priority 0–5, color, tags, note, section, completedAt }`,
`normalizeData(note)` → `{ items, sections, tagColors }`,
`DragController.init(listEl, getItems, getSections, onReorder)` — grip drag with a drop
indicator; the dropped item adopts the target's section.

## `src/content/outline-ops.js` (275) — `StickySites.OutlineOps` (pure; unit-tested)

`genId`, `normalizeNode/normalizeItems`, `findParent(id, arr)` → `{ parent, array, index }`,
`findNode`, `getPathTo`, `insertSiblingAfter`, `indentNode`, `outdentNode`, `moveNode(items, id, ±1)`,
`removeNode` (promotes children), `extractTags`, `filterTree(items, q)` (matches + ancestors,
`null` when empty), `autoGroup` (by first tag → shared keyword → "Other"), `toMarkdown`
(`~~done~~`), `toOPML(items, name)` (OPML 2.0 with `_note`, `_complete`).

## `src/content/outline.js` (800) — `StickySites.Outline`

| Member | Purpose |
|---|---|
| `readLibrary()` | Decrypt `stickysites_outlines_v1` → `{ map, docs }` sorted by `updatedAt` desc; legacy hostname keys adapt |
| `writeDoc(key, name, items)` | Upsert; returns `null` (refuses) while locked |
| `newDocKey()` | `ol_<id>` |
| `render(panel, noteType, explicitKey)` | Resolve doc (explicit key → `getKey` → `activeOutlineId` → first doc → create "My outline"); build switcher, toolbar, ⋯ menu (New / Rename / Duplicate / Delete / Auto-group + 10 s Undo / Export Markdown / Export OPML), breadcrumb, list, filter |

Keyboard on a node input: Enter (sibling), Ctrl/Cmd+Enter (done), Tab / Shift+Tab (indent /
outdent, never above the zoom root), Alt+↑/↓ (move), ↑/↓ (focus), Backspace on empty (delete),
Esc (blur). Prefs: reads/writes `activeOutlineId`. Shows `.stickysites-outline-locked` while locked.

## `src/content/mentions.js` (262) — `StickySites.Mentions`

`attach(editorEl)` watches for `@`, `show()` / `hide()`. Categories Link (paste URL, current
page URL), Date (today, tomorrow, this week, pick), Contact (name, email), File. Dropdown
`#stickysites-mentions` positioned at the caret; ↑/↓, Enter/Tab select, Esc; inserts
`.stickysites-mention-chip`. Uses `prompt()` for free-text input.

## `src/content/panel.js` (1874) — `StickySites.Panel`

| Method | Purpose |
|---|---|
| `init(onClose)` | Create `#stickysites-panel`; drag (header) and 8-grip resize (`_initResize` pins to absolute left/top); drag-off-page popout hint within 28 px of an edge |
| `open(noteType)` | Flush pending save → snapshot `_activeKey` / `_activeLabel` → `_readNote` (decrypt) → `_render` / `_renderTodo` / `Outline.render` → apply `panelSize` / `panelPosition` |
| `close()` | Flush, tear down |
| `flushPendingSave()` | Run an armed debounce immediately |
| `syncFromStorage(changes)` | Rich-text types only; self-echo, focus, encryption guards |
| `_popoutActiveNote()` | Flush → `runtime.sendMessage(STICKYSITES_POPOUT)` |
| `_buildToolbar()` | 19 controls: 16 buttons + font family (5) + font size (4) + color |
| `_readNote` / `_writeNote` / `_writeStructured` | Storage with encryption; `_writeStructured` preserves items another writer added (`_loadedIds`) |
| `_toggleExpand()` | 900 px wide; min size 350×250 |

Find & Replace: `Cmd/Ctrl+F` / `Cmd/Ctrl+H` toggle the bar; Enter / Shift+Enter next / prev;
Esc closes; `<mark>` highlights stripped by `getCleanHtml()` before save. To-do input keys:
Enter (new), Tab / Shift+Tab (indent 0–3), Backspace on empty (delete), Esc (blur); tag input
Enter adds a tag. Opening the to-do panel focuses the first empty task (creating one if needed).
Prefs written: `panelPosition`, `panelSize`.

## `src/content/sticky-inject.js` (295) — orchestrator IIFE

Exits if `#stickysites-cluster` exists. Functions: `findNoteType`, `checkUnlocked`,
`showLockOverlay` (`#stickysites-lock`, Enter unlocks), `handleIconClick`, `showToast`
(`#stickysites-toast`), `clipToNote`, `onUrlChange` (`popstate`, `hashchange`, 1 s poll →
`Cluster.refreshIcons()` + re-open site/page note under the new key).
Messages handled: `STICKYSITES_TOGGLE`, `STICKYSITES_OPEN { noteTypeId, key? }`,
`STICKYSITES_CLIP { noteTypeId, text }`. Keyboard: `Ctrl/Cmd+F1…F6` toggle types 0–5
(respecting `enabledTypes`, through the lock check). Forwards `storage.onChanged` to
`Panel.syncFromStorage`.

## `src/content/sticky-inject.css` (1156)

All injected styles: cluster, panel, toolbar, find bar, to-do list, outliner, mentions,
lock overlay, toast, popout hint, dark theme, animations. Also linked by `popout.html`.

---

## `src/shared/todo-bridge.js` (137, ES exports) — used by the SW; unit-tested

| Export | Purpose |
|---|---|
| `TODO_HOST` | `'com.mitch.todo_bridge'` |
| `TODOS_KEY` | `'stickysites_todos_v1'` |
| `buildRequest(record, extId)` | `{ cmd:'sync', ext, items[{id,text,done,note,section}], sections[{id,name}] }` |
| `applyHostResult(record, hostItems)` | Merge host items with local-only fields (indent, priority, color, tags, completedAt); section names ↔ ids; prune empty host-origin sections; `{ items, sections, changed }` via canonical JSON compare |
| `isEncryptedValue(v)` | Same test as `Crypto.isEncrypted` |
| `syncTodosWithHost({ storage, sendNativeMessage, extId })` | Skip if encrypted; round-trip; write only when `changed`; returns `{ changed, count }`, `{ skipped }`, or `{ error }` |

## `src/shared/peer-sync.js` (ES exports) — used by the SW; unit-tested

| Export | Purpose |
|---|---|
| `NOTE_KEYS`, `TOMBSTONES_KEY`, `CRYPTO_KEY`, `CACHED_KEY`, `PEER_STATE_KEY`, `DEFAULT_DAEMON_URL` | Constants (`http://127.0.0.1:47831`) |
| `buildSnapshot({ deviceId, notes, tombstones, crypto, ts })` | `{ version:1, deviceId, ts, notes, tombstones, crypto:{enabled,salt}\|null, cryptoFull? }` |
| `recordsOf(storageKey, value)` / `fromRecords(storageKey, records)` | Normalise every note type to `{ recordKey: record }` (global note → `__single__`) and back |
| `cryptoCompatibility(local, remote)` | `compatible` / `adopt-remote` / `remote-off` / `mismatch` |
| `mergeNotes(local, remotes)` | Record-level LWW on `updatedAt` across N peers, tombstone-aware; `{ notes, tombstones, changedKeys, stats }` |
| `syncWithDaemon({ storage, fetch, daemonUrl, cryptoApi, now })` | Full round: read → `PUT /snapshot` → `GET /peers/snapshots` → per-peer vault decision → decrypt → merge → write changed keys (re-encrypted when the vault is on) → persist `stickysites_peer_v1` |
| `addTombstone(tombstones, storageKey, recordKey, when)` | Immutable helper for writers that delete records |
| `isEnvelope(v)`, `genDeviceId()` | Helpers |

## `src/shared/crypto.js` (ES exports) — tests + SW

`generateSalt`, `deriveKey` (same PBKDF2/AES-GCM parameters as the namespace version),
`encrypt`, `decrypt`, `importJwk` (cached JWK → `CryptoKey`; used by the SW's peer merge),
`isEncrypted`. Kept in lock-step with `crypto-content.js` (which gained `importJwk` too).

## `peer/stickysites-peer.py` (stdlib Python 3.9+) — local peer daemon

| Piece | Purpose |
|---|---|
| Loopback HTTP `127.0.0.1:47831` | `PUT /snapshot` (stores to `~/.stickysites/snapshot.json`, 0600), `GET /peers/snapshots` (fetches every live peer, ETag-cached), `GET /status`, `GET /config` / `PUT /config` (pairing key, static peers, name — validated, hot-applied, persisted; a key change drops known peers); CORS for `chrome-extension://` origins only |
| LAN HTTPS `0.0.0.0:47832` | `GET /snapshot` (ETag / 304 / 204), `GET /hello`; `Authorization: Bearer HMAC(pairKey,'auth')`; self-signed cert from `openssl` |
| UDP `:47833` — multicast `239.255.77.31`, subnet broadcast, optional unicast (`static_peers`) | Announce every 5 s `{ id, name, port, fp, ts, addrs, sig }`, HMAC-signed with the pairing key, on every non-tunnel interface (table rescanned every 60 s; LAN addresses advertised first, tunnels last); listener joins the group per interface and also receives broadcasts; drops unsigned/stale/self; peers expire after 20 s |
| `fetch_peer` | Tries each announced address (recv addr first), pins the cert SHA-256 from the announcement, bearer auth, `If-None-Match` |
| CLI | `install [--pair-key] [--name]` (config + cert + launchd agent `com.stickysites.peer`), `uninstall`, `run`, `status`, `pair [KEY]`, `init` (tests) |

`peer/test_peer.py` boots two daemons on ephemeral ports and checks CORS, bad-snapshot rejection, LAN auth, and the discovery + snapshot round-trip.

## `src/shared/notes-storage.js` (363, ES exports) — reference CRUD; tests only

`getSiteKey`, `getPageKey`, `getDailyKey`; read/write/delete/readAll for global, site, page,
daily, todo, outline; `parseTags`; `createDebouncedSaver(fn, 500)`; `readPrefs` / `writePrefs`.
Plaintext only (no encryption). The extension runtime does not import it — `panel.js`,
`outline.js`, `sticky-inject.js`, and `popup.js` talk to `chrome.storage.local` directly — so
it documents the record shapes and backs `tests/notes-storage.test.js`.

---

## Popup — `popup.html` (48) / `popup.js` (869) / `popup.css` (447)

Loads `crypto-content.js` + `popup.js` with `<script>` tags. Lock screen
(`checkAndShowLock`), Settings (Enable / Disable / Lock Now, note-type checkboxes →
`enabledTypes`, layout → `clusterLayout`, written directly to `stickysites_prefs_v1`),
`loadAllNotes()` (decrypts all six keys), search / sort / type tabs / tag filter, Markdown
export (one or all), Quick-Open row → `STICKYSITES_OPEN` to the active tab or
`STICKYSITES_POPOUT` fallback on `chrome://` pages (`computePopoutTarget`).

## Popout — `popout.html` (20) / `popout.js` (41) / `popout.css` (34)

Loads crypto-content, note-types, prefs, todo, outline-ops, outline, mentions, panel, then
`popout.js`: reads `type`, `key`, `label` from the query string, clones the note type with
overridden `getKey` / `getLabel`, `Panel.init(window.close)`, `Panel.open`, removes the resize
grips. `popout.css` makes the panel fill the window and hides expand/popout buttons.

---

## Tooling — `scripts/`

| File | Lines | Purpose |
|---|---|---|
| `check-syntax.mjs` | ~60 | `npm run lint`: `node --check` every `.js`/`.mjs`; manifest ↔ package version agreement |
| `check-doc-indexes.mjs` | ~110 | `npm run docs:check-indexes`: path-validate `docs/high_signal_file_index.json` and `llms.txt` links; `--prune` |
| `rotate-workflow-logs.mjs` | ~170 | `npm run logs:rotate`: move oldest `## ` sections of `memory.md` / `prompts.md` to `docs/archive/` past ~200 KB; refuses while an editor swap file is live |
| `generate-icons.js` | 44 | `npm run icons`: draw `icons/icon{16,48,128}.png` with `canvas` (CommonJS) |
| `verify-live.mjs` | 464 | `npm run verify:live`: puppeteer-core harness — identity icons, caret stability, per-page identity, SPA re-key, cross-tab sync, outliner (a–k), popup labels/storage, encryption enable/lock/unlock. Needs Chrome for Testing (`SS_CHROME`) |
