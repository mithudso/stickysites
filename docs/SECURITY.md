# Security

## Threat model

StickySites runs as a Chrome Extension on every web page. It injects DOM elements into
untrusted host pages, stores user-created notes locally with optional encryption, and
optionally syncs notes to Google Drive.

### Attack surface

| Vector | Risk | Mitigation |
|--------|------|------------|
| Host page reads note content | Medium — page JS can query the note panel DOM | Notes contain user-authored text. Opt-in encryption (AES-GCM) protects notes at rest; in-memory plaintext is exposed while the panel is open. Future improvement: Shadow DOM encapsulation. |
| Host page spoofs StickySites UI | Low — a malicious page could create `#stickysites-cluster` to suppress injection | Extension checks element existence before injecting. Impact is denial of the extension UI, not data theft. |
| XSS via note content | Low — notes are rendered as user-authored rich HTML in a `contenteditable` div | No untrusted third-party HTML is ever rendered. All note bodies are written by the user in the same trust context. |
| Storage tampering | Low — `chrome.storage.local` is isolated per extension | Other extensions cannot read or write StickySites storage. |
| Context menu selection text | Low — the service worker receives `selectionText` from the host page | Text is appended verbatim to a note. It is HTML-entity-escaped before being inserted into rich-text bodies, preventing injection. |
| Encryption passphrase brute-force | Low — PBKDF2 600 K iterations makes offline attacks expensive | The derived key is never persisted to disk; only the JWK is stored in `chrome.storage.session` (cleared on browser close). |
| Google OAuth token leakage | Low — token is obtained via `chrome.identity` and stored in Chrome's token cache | Tokens are never written to extension storage. They are passed in-memory within the service worker only. |
| Content script on sensitive pages | N/A — Chrome blocks content scripts on `chrome://`, `chrome-extension://`, and the Chrome Web Store | Built-in Chrome protection. |

### Permissions audit

| Permission | Justification | Least-privilege? |
|------------|--------------|-----------------|
| `storage` | Note persistence in `chrome.storage.local`; session key in `chrome.storage.session` | Yes |
| `activeTab` | Send messages to the currently active tab | Yes — does not grant broad host access |
| `contextMenus` | Register the "StickySites" right-click submenu | Yes |
| `identity` | Google OAuth token for Drive sync | Yes — limited to `drive.appdata` scope (app-private folder only) |

No `tabs`, `webRequest`, `cookies`, `history`, or broad host permissions are requested.

### Data handling

- All notes are stored in `chrome.storage.local` on the user's device.
- No data is transmitted over the network unless the user explicitly enables Drive sync.
- Drive sync uses Google OAuth via `chrome.identity`; only the `drive.appdata` scope is
  requested, which limits access to an app-private folder invisible to other apps.
- No analytics, telemetry, or crash reporting of any kind.
- No third-party scripts, CDN resources, or external iframes.

## Encryption at rest

Encryption is opt-in and requires the user to set a passphrase.

### Algorithm

- **Cipher**: AES-256-GCM (authenticated encryption, provides confidentiality and integrity)
- **Key derivation**: PBKDF2 with 600,000 iterations, SHA-256, a random 16-byte salt
- **IV**: 12 random bytes per encryption operation (never reused)
- **Envelope format**: `{ iv: base64, data: base64 }`

### Key lifecycle

1. On `enable(passphrase)`, a random salt is generated and the key is derived.
2. A verification blob is encrypted and stored in `stickysites_crypto_v1` alongside the
   salt. The actual passphrase is never stored.
3. The derived CryptoKey is exported as JWK and stored in `chrome.storage.session`
   (accessible to content scripts because the service worker sets
   `setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`).
4. All existing note values are re-encrypted in place.
5. On subsequent browser sessions, the user enters their passphrase once. The key is
   re-derived from the stored salt, verified against the stored blob, then re-cached in
   `chrome.storage.session` for the remainder of the session.
6. Closing the browser clears `chrome.storage.session`, requiring re-entry of the
   passphrase on next session.
7. On `disable()`, all notes are decrypted in place, the config key is removed, and
   the session key is cleared.

### Caveats

- Encryption covers only the six note storage keys. Prefs and sync metadata are not
  encrypted.
- PBKDF2 at 600 K iterations can take 1–3 seconds on low-end devices.
- Conflict copies created by Drive sync (`_conflict_<timestamp>` keys) are stored
  unencrypted if the conflict was resolved while the notes were encrypted at rest, because
  the loser value is stored as-received from Drive.

## Reporting vulnerabilities

Open an issue on this repository or email the maintainer directly.
