# Runbook: encryption — lock, unlock, recover

Vault design: `docs/SECURITY.md`. Code: `src/content/crypto-content.js`, `src/shared/note-writer.js`, popup Settings.

**Precondition**: you know whether encryption is enabled — in any extension console
`chrome.storage.local.get('stickysites_crypto_v1', console.log)` shows `{ enabled: true, … }`.

## Lock now

Popup → Settings → **Lock Now**. This clears the JWK value in `stickysites_cached_key` and clears the
in-memory key in that page; other open contexts invalidate their key cache on storage changes/read. Clicking any
cluster icon now shows the in-page lock overlay.

Console equivalent: `await StickySites.Crypto.clearCachedKey()`.

## Unlock

Click **Unlock in StickySites** on the page notice, or open the extension toolbar popup.
Enter the passphrase in that extension window. Passphrase inputs never appear in the host
page DOM. The dedicated unlock window closes after success and resumes the pending note.
PBKDF2 duration depends on the hardware; the popup shows "Unlocking...". A wrong passphrase
returns to the input with an error and does not write changes.

## Recovery when the passphrase is lost

There is no recovery path: the key is derived from the passphrase and the stored salt; the
passphrase is never stored. Options:

1. Keep the encrypted data and wait to remember (nothing expires).
2. Start over: remove the six note keys and the crypto config —
   ```js
   chrome.storage.local.remove(['stickysites_global_v1','stickysites_sites_v1','stickysites_pages_v1',
     'stickysites_todos_v1','stickysites_outlines_v1','stickysites_daily_v1',
     'stickysites_crypto_v1','stickysites_cached_key'])
   ```
   This is irreversible; export first if any plaintext copy exists (popup → Export).

## Verification

- After lock: `chrome.storage.local.get('stickysites_cached_key')` → absent or `null`, with no JWK; cluster icon
  click shows `#stickysites-lock`.
- After unlock: the same call returns a JWK object; notes render.

Enable/disable stage every bucket before a guarded service-worker commit. A corrupt bucket
or `STATE_CHANGED` leaves the previous vault state available for recovery. No partial
transform should be treated as a completed transition.

## Safety invariants to preserve when changing this code

- Never write plaintext to a note key while `enabled` and no cached key (the outliner
  shows a lock notice instead of auto-creating a doc; `todo-bridge` skips sync).
- `isEncrypted()` must keep rejecting shapes with `body` / `items` / `siteKey` so a plain
  record is never mistaken for an envelope.
- Change `src/shared/crypto.js` and `src/content/crypto-content.js` together.
