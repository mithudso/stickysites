# Runbook: encryption — lock, unlock, recover

Vault design: `docs/SECURITY.md`. Code: `src/content/crypto-content.js`, popup Settings.

**Precondition**: you know whether encryption is enabled — in any extension console
`chrome.storage.local.get('stickysites_crypto_v1', console.log)` shows `{ enabled: true, … }`.

## Lock now

Popup → Settings → **Lock Now**. This removes `stickysites_cached_key` and clears the
in-memory key in that page; other open tabs drop their key on next read. Clicking any
cluster icon now shows the in-page lock overlay.

Console equivalent: `await StickySites.Crypto.clearCachedKey()`.

## Unlock

Type the passphrase in the lock overlay (or popup lock screen). PBKDF2 takes 1–4 s with no
spinner (known issue). A wrong passphrase returns to the input with an error; nothing is
written.

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

- After lock: `chrome.storage.local.get('stickysites_cached_key')` → `{}`; cluster icon
  click shows `#stickysites-lock`.
- After unlock: the same call returns a JWK object; notes render.

## Safety invariants to preserve when changing this code

- Never write plaintext to a note key while `enabled` and no cached key (the outliner
  shows a lock notice instead of auto-creating a doc; `todo-bridge` skips sync).
- `isEncrypted()` must keep rejecting shapes with `body` / `items` / `siteKey` so a plain
  record is never mistaken for an envelope.
- Change `src/shared/crypto.js` and `src/content/crypto-content.js` together.
