# Security

## Threat model

StickySites runs as a Chrome Extension on every web page. It injects DOM elements
into untrusted host pages and stores user-created notes locally.

### Attack surface

| Vector | Risk | Mitigation |
|--------|------|------------|
| Host page reads note content | Medium — any page JS can query `#stickysites-drawer` textarea value | Notes contain user-authored text, not secrets. Future: use Shadow DOM for encapsulation. |
| Host page spoofs StickySites UI | Low — page could create fake elements with matching IDs | The extension checks `#stickysites-strip` existence before injecting, which a malicious page could exploit to suppress injection |
| XSS via note content | Low — notes are set via `.textContent` and `.value`, not `.innerHTML` | No HTML parsing of user input anywhere in the codebase |
| Storage tampering | Low — `chrome.storage.local` is isolated per extension | Other extensions cannot read StickySites storage |
| Content script on sensitive pages | N/A — Chrome blocks content scripts on `chrome://`, `chrome-extension://`, and Web Store pages | Built-in Chrome protection |

### Permissions audit

| Permission | Justification | Least-privilege? |
|------------|--------------|-----------------|
| `storage` | Required for note persistence | Yes |
| `activeTab` | Send toggle message to current tab only | Yes — does not grant broad host access |

No `tabs`, `webRequest`, `cookies`, `identity`, or host permissions are requested.

### Data handling

- All data stays in `chrome.storage.local` on the user's machine.
- No data is transmitted over the network.
- No analytics, telemetry, or crash reporting.
- No third-party scripts or CDN resources.

## Reporting vulnerabilities

Open an issue on this repository or email the maintainer directly.
