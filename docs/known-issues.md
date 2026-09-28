# Known issues

Format: symptom → cause → workaround → files.

## No Shadow DOM encapsulation
**Impact**: Low–Medium · **Status**: Open
Injected elements live in the host page's DOM, so aggressive host CSS (`* { all: unset }`,
broad `div` rules) can break the UI, and host JavaScript can read an open panel's content.
Workaround: none; encryption protects data at rest only. Fix: wrap the UI in a Shadow DOM root.
Files: `src/content/sticky-inject.js`, `cluster.js`, `panel.js`, `sticky-inject.css`.

## Orphaned listeners after extension reload
**Impact**: Low · **Status**: Mitigated
After an extension update Chrome may re-inject content scripts. The `#stickysites-cluster`
guard prevents a second UI, but listeners from the previous injection remain until the page
reloads. Workaround: reload the page after updating. Files: `sticky-inject.js`.

## PBKDF2 unlock has no progress indicator
**Impact**: Low (UX) · **Status**: By design
600,000 iterations take 1–4 s on slow hardware; the unlock button appears to hang.
Workaround: wait. Fix: spinner / "Unlocking…" state in the lock overlay and popup lock screen.
Files: `sticky-inject.js` (`showLockOverlay`), `popup.js`.

## Cached key persists on disk until Lock Now
**Impact**: Medium while unlocked · **Status**: By design (ADR-3)
`stickysites_cached_key` (JWK) sits in the Chrome profile across restarts. Anyone with the
profile directory can read it while the vault is unlocked. Workaround: click **Lock Now**
when leaving the machine. Files: `crypto-content.js`, `popup.js`.

## `src/shared/notes-storage.js` is not the runtime storage layer
**Impact**: Low (maintenance) · **Status**: Open
The extension reads/writes `chrome.storage.local` directly in `panel.js`, `outline.js`,
`sticky-inject.js`, and `popup.js`; `notes-storage.js` is imported only by tests, so its
record shapes can drift from what the UI writes (it is plaintext-only). Workaround: treat it as documentation + test fixture; when changing a record
shape, update both. Fix: either route the UI through it or trim it to what tests need.

## Popup bypasses `Prefs`
**Impact**: Low · **Status**: Open
`popup.html` does not load `prefs.js`, so `popup.js` writes `enabledTypes` / `clusterLayout`
with `chrome.storage.local.set` directly. Any new default added to `prefs.js` must be
mirrored there. Files: `popup.js`, `src/content/prefs.js`.

## `panelMode` pref is unused
**Impact**: None · **Status**: Open
`prefs.js` defaults `panelMode: 'fixed'` and tests round-trip it, but no runtime code reads
it. Safe to remove once tests are adjusted. Files: `prefs.js`, `notes-storage.js`, tests.

## Peer sync: only outline deletions propagate
**Impact**: Low · **Status**: By design (for now)
Peer sync uses tombstones to delete records on other machines, and only the outliner's Delete
writes one (no other note type has a delete action in the UI). If a future delete path is added,
call `addTombstone` from `src/shared/peer-sync.js` or the record will reappear from a peer.
Files: `src/content/outline.js`, `src/shared/peer-sync.js`.

## Peer sync needs peers on the same subnet (or a static peer address)
**Impact**: Low · **Status**: By design
Discovery is UDP multicast plus subnet broadcast on port 47833 on every non-tunnel interface;
networks with client isolation or that drop UDP need `install --peer <IP>` on each side.
Under a VPN that owns the default route macOS refuses the multicast send (`No route to host`) —
the broadcast path still delivers, so that log line (printed once) is noise. Files:
`peer/stickysites-peer.py`, `docs/runbooks/peer-sync.md`.

## To-do sync requires a per-browser host manifest
**Impact**: Low · **Status**: By design
Each Chromium browser (Chrome, Chrome Beta, Brave, Arc…) has its own `NativeMessagingHosts`
directory and each unpacked install has its own extension id. Re-run
`todo.py install-native-host` after loading the extension from a new path or in a new browser.
Files: `docs/runbooks/todo-sync-troubleshooting.md`.

## Live harness needs Chrome for Testing
**Impact**: Low (tooling) · **Status**: By design
Branded Chrome 137+ ignores `--load-extension`, so `npm run verify:live` needs a Chrome for
Testing / Chromium binary (`SS_CHROME`). The harness header still says "v1.10" and strips a
`.stickysites-cluster-badge` element that no longer exists — harmless. Files: `scripts/verify-live.mjs`.

## Encryption covers note keys only
**Impact**: Low · **Status**: By design
Prefs (`stickysites_prefs_v1`) and the crypto config are plaintext; note *titles* are not
stored separately, but site/page keys (hostnames, paths) live inside the encrypted envelopes
and are therefore protected. Files: `crypto-content.js`.
