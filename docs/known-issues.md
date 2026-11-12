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
PBKDF2 duration depends on the hardware. The popup shows "Unlocking…" while it works;
the in-page overlay has no detailed progress indicator. Wait for its result before retrying.
Files: `sticky-inject.js` (`showLockOverlay`), `popup.js`.

## Cached key persists on disk until Lock Now
**Impact**: Medium while unlocked · **Status**: By design (ADR-3)
`stickysites_cached_key` (JWK) sits in the Chrome profile across restarts. Anyone with the
profile directory can read it while the vault is unlocked. Workaround: click **Lock Now**
when leaving the machine. Files: `crypto-content.js`, `popup.js`.

## `src/shared/notes-storage.js` is not the runtime storage layer
**Impact**: Low (maintenance) · **Status**: Open
Runtime mutations use `storage-content.js` IPC and the service worker `note-writer.js`
queue. `notes-storage.js` is a plaintext test reference, so its record shapes can still
drift. Treat the runtime writer as authoritative and update reference tests when schemas change.

## Preference normalization drift
**Impact**: Low · **Status**: Resolved for runtime writes
Popup and content contexts use `settings.js` normalization and queued preference mutations.
Add new preference defaults there and keep the plaintext `notes-storage.js` reference in sync.
Files: `src/shared/settings.js`, `src/content/prefs.js`, `src/shared/note-writer.js`.

## `panelMode` pref is unused
**Impact**: None · **Status**: Open
`prefs.js` defaults `panelMode: 'fixed'` and tests round-trip it, but no runtime code reads
it. Safe to remove once tests are adjusted. Files: `prefs.js`, `notes-storage.js`, tests.

## Peer sync: only outline deletions propagate
**Impact**: Low · **Status**: By design (for now)
Peer sync uses tombstones to delete records on other machines, and only the outliner's Delete
writes one (no other note type has a delete action in the UI). If a future delete path is added,
use the queued delete operation so the record removal and tombstone publish together;
otherwise a peer can restore the record.
Files: `src/content/outline.js`, `src/shared/peer-sync.js`.

## Peer sync needs peers on the same subnet (or a static peer address)
**Impact**: Low · **Status**: By design
Discovery is UDP multicast plus subnet broadcast on port 47833 on every non-tunnel interface;
networks that drop multicast/broadcast may need static peer IPs on each side (popup
Settings → Peer IPs, or `install --peer <IP>`).
Under a VPN that owns the default route macOS refuses the multicast send (`No route to host`) —
the broadcast path still delivers, so that log line (printed once) is noise. Files:
`peer/stickysites-peer.py`, `docs/runbooks/peer-sync.md`.
A VPN that tunnels every app (e.g. Surfshark with Bypasser on) also blocks the helper's LAN
unicast and TCP entirely until **StickySites Peer** (`~/Applications`) is added to its bypass
list; **Test connection** in the popup names this case.
The launchd job must not run under Homebrew's python3: macOS attributes its LAN sends to
Python.app, which never gets the Local Network prompt from a background job, so they fail with
`No route to host` while `nc`/`curl` work. `install` therefore prefers Apple's `/usr/bin/python3`
(Command Line Tools; `--python PATH` overrides) and the log's `interpreter …` line shows which one runs.
If direct LAN transport is blocked, the Sync folder path uses the chosen folder provider
instead. A cloud or network share still needs that provider's transport; local-only folders
do not synchronize machines by themselves.

## To-do sync requires a per-browser host manifest
**Impact**: Low · **Status**: By design
Each Chromium browser (Chrome, Chrome Beta, Brave, Arc…) has its own `NativeMessagingHosts`
directory and each unpacked install has its own extension id. Re-run
`todo.py install-native-host` after loading the extension from a new path or in a new browser.
Files: `docs/runbooks/todo-sync-troubleshooting.md`.

## Live harness needs Chrome for Testing
**Impact**: Low (tooling) · **Status**: By design
Branded Chrome 137+ ignores `--load-extension`, so `npm run verify:live` needs a Chrome for
Testing / Chromium binary (`SS_CHROME`, shared with the screenshot harness). Synthetic
jsdom tests cover runtime behavior but do not establish live Chrome layout/permissions.
Files: `scripts/verify-live.mjs`, `scripts/store-screenshots.mjs`.

## Encryption covers note keys only
**Impact**: Low · **Status**: By design
Prefs, crypto config, device/folder metadata, and tombstones remain plaintext. Site/page
record keys live inside encrypted note buckets, but a deletion tombstone exposes the deleted
record key and timestamp. A signed folder file is not itself encrypted. Files:
`crypto-content.js`, `src/shared/peer-sync.js`, `peer/stickysites-peer.py`.
