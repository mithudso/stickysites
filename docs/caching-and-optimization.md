# Caching and Optimization

## Cache layers

| Layer | What is cached | Invalidation |
|---|---|---|
| `Crypto._cachedKey` (in-memory, per page / per extension page) | The imported `CryptoKey` after the first `getCachedKey()` | Cleared by `clearCachedKey()` (Lock Now, disable) and on page unload |
| `chrome.storage.local["stickysites_cached_key"]` | JWK export of the derived AES-GCM key | Removed by Lock Now / disable; **persists across browser restarts** until then |
| `Panel._loadedIds` | Ids of to-do items present when the panel opened | Rebuilt on every `open()`; lets `_writeStructured` keep items another writer (the TODO.md sync) added meanwhile |
| `Panel._lastWrittenBody` | The HTML this panel last saved | Used by `syncFromStorage` to skip its own echo from `chrome.storage.onChanged` |
| Daemon peer ETags | Last fetched snapshot per authenticated peer | A changed ETag fetches fresh content; pairing-key rotation clears trust/cache |
| Daemon folder cache | File docs keyed by mtime and size; last published snapshot etag | Folder/key/name changes invalidate publication; writes serialize with signing config |
| Popup `loadAllNotes()` result | Decrypted list of every note | Re-read on every popup open; no persistence |

The extension has no CDN or hosted database. It stores data in `chrome.storage.local`;
the optional daemon also stores a local snapshot and uses peer HTTP ETags/folder caches.

## Performance patterns in use

- **Debounced auto-save (500 ms)** for every editor (`panel.js`); `flushPendingSave()` forces
  the trailing write before close / switch / popout / SPA re-key.
- **Debounced to-do sync (3 s)** after a `stickysites_todos_v1` change, plus a 2-minute
  `chrome.alarms` period, with a `todoSyncRunning` re-entrancy guard (`service-worker.js`).
- **Change detection before write** in `todo-bridge.applyHostResult` — a canonical
  (key-sorted) serialization compares the merged list with the stored one so unchanged
  syncs never touch storage or wake other tabs.
- **Read-time schema adaptation** instead of migrations: legacy `siteKey`/`pageKey`/hostname
  outline keys are normalised when read, never rewritten in bulk.
- **1 s `href` poll** for SPA navigation (`sticky-inject.js`) instead of a `MutationObserver`
  over the whole document.
- **`document_idle`** injection so the host page finishes its own work first.
- **Single `chrome.storage.onChanged` listener** per tab fans out to the open panel only.

## Known bottlenecks

| Bottleneck | Cost | Mitigation |
|---|---|---|
| PBKDF2 at 600,000 iterations | 1–4 s per unlock on slow hardware, blocks the unlock button | Deliberate KDF cost; a spinner is an open item in `known-issues.md` |
| `enable()` / `disable()` re-encrypt all six note keys in one pass | Proportional to total note size | Stages all bucket transformations before one guarded commit; a failed stage preserves prior state |
| Popup `loadAllNotes()` decrypts every record on open | Linear in note count | Acceptable at hundreds of notes; paginate if it grows |
| `execCommand`-based toolbar | Synchronous DOM mutation on large bodies | No action; bodies are small |

## Profiling

- **Content script**: DevTools → Performance on the host page; filter by `stickysites` in the
  call tree. Record while typing to see the 500 ms save cadence.
- **Service worker**: `chrome://extensions` → Service worker → Performance tab; trigger a
  sync by editing a to-do and watch `runTodoSync`.
- **Storage size**: in any extension console,
  `chrome.storage.local.getBytesInUse(null, b => console.log(b))`.
