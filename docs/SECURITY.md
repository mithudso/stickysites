# Security

## Threat model

StickySites runs as a Chrome Extension on every web page. It injects DOM into untrusted host
pages, stores user notes locally with optional encryption, and (optionally) exchanges the
to-do list with a local native-messaging host. An optional daemon exposes loopback HTTP
and authenticated LAN HTTPS/UDP discovery, and can use a shared/cloud folder.

### Attack surface

| Vector | Risk | Mitigation |
|--------|------|------------|
| Host page reads note content from the injected DOM | Medium — page JS can query `#stickysites-panel` while it is open | Encryption protects data at rest only; in-memory plaintext is exposed while a panel is open on that page. Future: Shadow DOM (`known-issues.md`). |
| Host page spoofs `#stickysites-cluster` to suppress injection | Low | Denial of the UI only; no data exposure. |
| XSS via note content | Low — notes are user-authored rich HTML rendered in a `contenteditable` | Imported/synced rich HTML is parsed inertly and filtered by `safe-html.js` before live rendering. Scripts, event attributes, resource nodes, and unsafe URLs are removed. Clipped text is escaped. This does not isolate the open panel from host scripts. |
| Storage tampering by another extension | Low | `chrome.storage.local` is isolated per extension. |
| Cached key on disk | Medium while unlocked | `stickysites_cached_key` (JWK) sits in the Chrome profile until **Lock Now**. Anyone with the profile directory and the extension id can read it. Lock when leaving the machine; see the encryption runbook. |
| Host page reads an unlock passphrase | Prevented by origin separation | Page notices request a fixed extension-origin popup; passphrases are entered only there, not in injected page inputs. |
| Passphrase brute force against the stored `verify` envelope | Low | PBKDF2 600,000 iterations, SHA-256, random 16-byte salt. |
| Native host impersonation | Low | Chrome only launches the host registered in the browser's `NativeMessagingHosts` manifest whose `allowed_origins` contains this extension id; the host runs as the local user. |
| Plaintext to-dos reaching `TODO.md` | By design when encryption is off | Sync is skipped entirely while `stickysites_todos_v1` is an encrypted envelope. |
| Peer daemon loopback API abused by another local extension | Low–Medium | Bound to `127.0.0.1`, validates loopback Host and extension Origin; cross-site browser GETs are rejected; no-Origin CLI requests remain supported; any extension on that machine could read/replace the snapshot — same trust boundary as the Chrome profile. Vault on ⇒ note buckets are envelopes; metadata remains readable. |
| Stranger on the LAN joins the sync | Low | Announcements are HMAC-signed with the pairing key and dropped otherwise; LAN requests need a bearer token derived from it; TLS cert fingerprint pinned from the signed announcement. Rotate the key with `stickysites-peer.py pair`. |
| Notes readable on the Wi-Fi | Low | Peer transport is HTTPS with pinned certs. Without the vault, notes are plaintext inside the tunnel; tombstones (record keys + timestamps) are always plaintext. |
| Snapshot file at rest | Same as Chrome storage | `~/.stickysites/snapshot.json` mode 0600; envelopes when the vault is on. |
| Shared/cloud-folder snapshot | Provider and local account can read plaintext metadata, and notes when the vault is off | HMAC authenticates files without encrypting them; choose the folder/provider deliberately and enable the vault for note confidentiality. |
| Stalled LAN client | Worker resource use | TLS handshakes run in workers with finite socket timeouts, leaving acceptance available. |
| Content script on sensitive pages | N/A | Chrome blocks content scripts on `chrome://`, `chrome-extension://`, the Web Store. |

### Permissions audit

| Permission | Justification | Least privilege? |
|------------|--------------|------------------|
| `storage` | Notes, prefs, crypto config, cached key in `chrome.storage.local` | Yes |
| `activeTab` | Message the active tab from the SW and popup | Yes — no broad host access |
| `contextMenus` | The "StickySites" clip submenu | Yes |
| `alarms` | To-do and peer sync schedules | Yes |
| `nativeMessaging` | Local IPC with `com.mitch.todo_bridge`; only a host manifest naming this extension id can answer | Yes — no network |

No `tabs`, `webRequest`, `cookies`, `history`, `identity`, `scripting`, or extra host permissions.

### Data handling

- Notes live in `chrome.storage.local` by default. No hosted telemetry, crash reporting,
  remote scripts, or remote resources are loaded.
- Optional native messaging sends plaintext to-dos to a local file while encryption is off.
- Optional loopback requests hand snapshots to the local daemon. The daemon can relay them
  to paired LAN machines or write signed files to a user-selected shared/cloud folder. The
  selected provider may store and transfer those files outside the LAN.
- Vault encryption covers the six note buckets. Tombstones (record keys/timestamps), crypto
  config, device identities, and folder-envelope metadata remain plaintext. Folder signatures
  authenticate snapshots; they do not encrypt them.

## Encryption at rest

Opt-in; enabled from the popup Settings panel with a passphrase.

### Algorithm

- **Cipher**: AES-256-GCM (confidentiality + integrity), 12-byte random IV per operation.
- **KDF**: PBKDF2, 600,000 iterations, SHA-256, random 16-byte salt.
- **Envelope**: `{ iv: base64, data: base64 }`. `isEncrypted()` accepts only that shape and
  rejects objects with `body`, `items`, or `siteKey` so a plain record is never mistaken for
  an envelope.

### Key lifecycle

1. `enable(passphrase)` derives a key and stages all encrypted note buckets, the verify
   token, configuration, and cached JWK before one guarded multi-key commit. A staging failure
   leaves the prior state intact. The passphrase is never stored.
2. Reads: `decryptValue()` uses the cached key; if none, the value stays an envelope and the UI
   shows the lock overlay (or the outliner's lock notice).
3. **Lock Now** (popup) / `clearCachedKey()`: clears the JWK value in `stickysites_cached_key` and the
   in-memory key. The cached key otherwise **persists across browser restarts**.
4. `unlock(passphrase)`: re-derive from the stored salt, decrypt `verify`, compare; on success
   cache the key again.
5. `disable()` stages every decryption before one guarded commit of plaintext buckets and
   cleared config/key. An unreadable bucket preserves the existing vault for recovery.

If a content page lacks `crypto.subtle` (ordinary HTTP), the content namespace routes vault
operations to the extension worker. The worker runs the same lifecycle implementation and
returns results over extension IPC. This preserves the envelope and local-JWK design.
See [MDN secure-context restrictions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#secure_contexts).

### Invariants the code enforces

- Never write plaintext to a note key while enabled and no cached key: the outliner shows a
  lock notice instead of auto-creating; the to-do sync skips; `syncFromStorage` skips; peer
  sync reports `locked` and writes nothing.
- Peer sync never mixes vaults: same salt → merge on decrypted data and re-encrypt; different
  salts → `mismatch`, nothing written; local vault off + peer on → adopt the peer's config
  (salt + verify token, never the passphrase) and lock.
- `src/content/crypto-content.js` and `src/shared/crypto.js` implement the same primitives
  and must change together.

### Mutation and transport boundaries

All runtime mutations enter the service worker queue, read fresh records, and verify the
stored result. Native/peer results commit only if their original inputs still match;
`STATE_CHANGED` preserves newer edits. This is a single-extension coordination mechanism,
not a filesystem or database transaction against unrelated programs.

The daemon validates request lengths before reading and bounds body/handshake waits.
Diagnostic requests send a bearer only after the remote certificate matches authenticated
discovery. Unknown certificates stop at the TLS step. Config and snapshot disk failures
preserve the prior successful state.

### Caveats

- Encryption covers the six note keys only; prefs, tombstones, and crypto/sync metadata are plaintext.
- There is no passphrase recovery; losing it means losing the notes
  (`runbooks/encryption-lock-and-recovery.md`).
- PBKDF2 at 600 K iterations takes 1–4 s on slow hardware with no spinner.

## Reporting vulnerabilities

See [`.github/SECURITY.md`](../.github/SECURITY.md): private advisory or maintainer email,
acknowledgement within 3 business days, fix or plan within 14 days.
