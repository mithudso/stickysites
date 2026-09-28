# Logging

## Approach

StickySites has **no logging framework and no log sink outside the browser**. There is no
server, no file, and no remote service. Diagnostics are the browser's own consoles:

| Context | Where output appears |
|---|---|
| Content scripts (`src/content/*.js`) | DevTools console of the host page |
| Service worker (`src/background/service-worker.js`) | `chrome://extensions` → StickySites → **Service worker** link |
| Popup / popout pages | Right-click the page → Inspect |

As of v1.11.1 the production code emits **`console.warn` on the service worker's failure
paths only** (to-do sync, clip delivery, toggle delivery). Everything else fails silently
by design — see "Silent-failure inventory" below.

## Levels

| Level | Meaning here |
|---|---|
| `console.warn` | An optional integration failed and the extension degraded gracefully (native host missing, tab without content script). Safe to ignore unless the user expected the feature. |
| `console.error` | Reserved for corrupted storage or a failed write the user would notice as lost data. Not used yet. |
| `console.log` / `debug` | Not used in shipped code. Add locally while debugging, remove before commit. |

## Structured shape

When you add a log line, prefix it so it can be filtered with the DevTools regex box:

```js
console.warn('[stickysites] todo-sync', { error: result.error, extId: chrome.runtime.id });
```

`[stickysites] <subsystem>` then one object. Never log a note body, a passphrase, or the
cached key.

## Silent-failure inventory

These `catch` blocks intentionally swallow errors and return a neutral value. They are the
paths the logging standard flags as "unlogged error paths"; each is listed with why it stays
quiet:

| Location | Behaviour | Why quiet |
|---|---|---|
| `src/content/crypto-content.js` `getCachedKey`, `clearCachedKey`, `unlock`, `decryptValue`, `_decryptAllNotes` | return `null` / `false` / the raw value | Called on every read; a wrong passphrase or locked vault is a normal state, not an error |
| `src/content/prefs.js` `read`/`write`, `src/shared/notes-storage.js` (all CRUD) | return defaults / `null` / `[]` | Storage is per-extension and effectively never fails; UI must still render |
| `src/content/panel.js` prefs writes, `_flushSave` calls | comment `best-effort` | Panel position/size are cosmetic; the pending save is retried on the next debounce |
| `src/content/panel.js:828` | skip a `Range` that crosses element boundaries | Find-highlighting edge case; the match is simply not highlighted |
| `src/content/outline.js:36` | treat undecryptable outline map as `{}` | Locked vault; the renderer shows the lock notice instead |
| `src/content/sticky-inject.js:217` | proceed without prefs | Only affects `enabledTypes` filtering of function-key shortcuts |
| `src/background/service-worker.js` (3 sites) | `console.warn('[stickysites] …')` | **Logged** — these are the integration boundaries (tabs without content script, native host missing) |

If you add a new external boundary (a new `chrome.runtime.sendNativeMessage`, a new message
type), log its failure path; if you add another storage read, the neutral-return pattern above
is fine.

## Sensitive data rules

Never write to any console:

- note bodies, to-do text, outline text (user content — may be confidential)
- the passphrase or the JWK in `stickysites_cached_key`
- the verify envelope or salt from `stickysites_crypto_v1`

Extension ids, storage key names, item counts, and error messages from the native host are fine.

## Testing logs

Unit tests (`tests/`) run in node with a mocked `chrome`; none assert on console output today.
When a service-worker failure path gains logic beyond `console.warn`, assert on it with
`vi.spyOn(console, 'warn')` in a new test rather than by reading the browser console.
