# Security

## Threat model

StickySites runs as a Chrome Extension on every web page. It injects DOM into untrusted host
pages, stores user notes locally with optional encryption, and (optionally) exchanges the
to-do list with a local native-messaging host. There is no network surface.

### Attack surface

| Vector | Risk | Mitigation |
|--------|------|------------|
| Host page reads note content from the injected DOM | Medium — page JS can query `#stickysites-panel` while it is open | Encryption protects data at rest only; in-memory plaintext is exposed while a panel is open on that page. Future: Shadow DOM (`known-issues.md`). |
| Host page spoofs `#stickysites-cluster` to suppress injection | Low | Denial of the UI only; no data exposure. |
| XSS via note content | Low — notes are user-authored rich HTML rendered in a `contenteditable` | No third-party HTML is ever rendered; clipped selection text is HTML-escaped before insertion. `<mark>` find-highlights are stripped before save. |
| Storage tampering by another extension | Low | `chrome.storage.local` is isolated per extension. |
| Cached key on disk | Medium while unlocked | `stickysites_cached_key` (JWK) sits in the Chrome profile until **Lock Now**. Anyone with the profile directory and the extension id can read it. Lock when leaving the machine; see the encryption runbook. |
| Passphrase brute force against the stored `verify` envelope | Low | PBKDF2 600,000 iterations, SHA-256, random 16-byte salt. |
| Native host impersonation | Low | Chrome only launches the host registered in the browser's `NativeMessagingHosts` manifest whose `allowed_origins` contains this extension id; the host runs as the local user. |
| Plaintext to-dos reaching `TODO.md` | By design when encryption is off | Sync is skipped entirely while `stickysites_todos_v1` is an encrypted envelope. |
| Peer daemon loopback API abused by another local extension | Low–Medium | Bound to `127.0.0.1`, CORS-gated to `chrome-extension://` origins; any extension on that machine could read/replace the snapshot — same trust boundary as the Chrome profile. Vault on ⇒ snapshot is envelopes. |
| Stranger on the LAN joins the sync | Low | Announcements are HMAC-signed with the pairing key and dropped otherwise; LAN requests need a bearer token derived from it; TLS cert fingerprint pinned from the signed announcement. Rotate the key with `stickysites-peer.py pair`. |
| Notes readable on the Wi-Fi | Low | Peer transport is HTTPS with pinned certs. Without the vault, notes are plaintext inside the tunnel; tombstones (record keys + timestamps) are always plaintext. |
| Snapshot file at rest | Same as Chrome storage | `~/.stickysites/snapshot.json` mode 0600; envelopes when the vault is on. |
| Content script on sensitive pages | N/A | Chrome blocks content scripts on `chrome://`, `chrome-extension://`, the Web Store. |

### Permissions audit

| Permission | Justification | Least privilege? |
|------------|--------------|------------------|
| `storage` | Notes, prefs, crypto config, cached key in `chrome.storage.local` | Yes |
| `activeTab` | Message the active tab from the SW and popup | Yes — no broad host access |
| `contextMenus` | The "StickySites" clip submenu | Yes |
| `alarms` | 2-minute to-do sync schedule | Yes |
| `nativeMessaging` | Local IPC with `com.mitch.todo_bridge`; only a host manifest naming this extension id can answer | Yes — no network |

No `tabs`, `webRequest`, `cookies`, `history`, `identity`, `scripting`, or extra host permissions.

### Data handling

- All notes stay in `chrome.storage.local` on the device. No network transmission, telemetry,
  crash reporting, third-party scripts, or remote resources.
- Data that can leave the browser, both to local processes only: the to-do list (items,
  sections, notes) to the native host when that sync is installed and encryption is off; and
  the note snapshot to the peer daemon on `127.0.0.1` when it is installed, from where it goes
  only to the user's own paired machines on the LAN (`peer/README.md`).

## Encryption at rest

Opt-in; enabled from the popup Settings panel with a passphrase.

### Algorithm

- **Cipher**: AES-256-GCM (confidentiality + integrity), 12-byte random IV per operation.
- **KDF**: PBKDF2, 600,000 iterations, SHA-256, random 16-byte salt.
- **Envelope**: `{ iv: base64, data: base64 }`. `isEncrypted()` accepts only that shape and
  rejects objects with `body`, `items`, or `siteKey` so a plain record is never mistaken for
  an envelope.

### Key lifecycle

1. `enable(passphrase)`: generate salt → derive key → encrypt a verify string → store
   `{ enabled: true, salt, verify }` in `stickysites_crypto_v1` → cache the key (JWK) in
   `stickysites_cached_key` → re-encrypt all six note keys in place. The passphrase is never stored.
2. Reads: `decryptValue()` uses the cached key; if none, the value stays an envelope and the UI
   shows the lock overlay (or the outliner's lock notice).
3. **Lock Now** (popup) / `clearCachedKey()`: removes `stickysites_cached_key` and the
   in-memory key. The cached key otherwise **persists across browser restarts**.
4. `unlock(passphrase)`: re-derive from the stored salt, decrypt `verify`, compare; on success
   cache the key again.
5. `disable()`: decrypt all notes in place, remove the config key and cached key.

### Invariants the code enforces

- Never write plaintext to a note key while enabled and no cached key: the outliner shows a
  lock notice instead of auto-creating; the to-do sync skips; `syncFromStorage` skips; peer
  sync reports `locked` and writes nothing.
- Peer sync never mixes vaults: same salt → merge on decrypted data and re-encrypt; different
  salts → `mismatch`, nothing written; local vault off + peer on → adopt the peer's config
  (salt + verify token, never the passphrase) and lock.
- `src/content/crypto-content.js` and `src/shared/crypto.js` implement the same primitives
  and must change together.

### Caveats

- Encryption covers the six note keys only; prefs and the crypto config are plaintext.
- There is no passphrase recovery; losing it means losing the notes
  (`runbooks/encryption-lock-and-recovery.md`).
- PBKDF2 at 600 K iterations takes 1–4 s on slow hardware with no spinner.

## Reporting vulnerabilities

See [`.github/SECURITY.md`](../.github/SECURITY.md): private advisory or maintainer email,
acknowledgement within 3 business days, fix or plan within 14 days.
