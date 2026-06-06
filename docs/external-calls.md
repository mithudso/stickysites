# External Calls

StickySites makes no external network calls. All data stays in `chrome.storage.local`
(with the cached encryption key in `chrome.storage.session`). There is no OAuth, no
telemetry, and no third-party requests.

## Chrome Storage

All storage calls are local and synchronous-in-practice. Not documented as
external calls since they never leave the browser.
