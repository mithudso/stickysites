# Logging

## Sinks and levels

The extension uses browser consoles rather than a logging framework or hosted telemetry.
The optional Python daemon separately appends to `~/.stickysites/peer.log` (or
`STICKYSITES_HOME/peer.log`). The external native host owns its own diagnostics.

| Context | Where to inspect |
|---|---|
| Content scripts | Host-page DevTools; `[stickysites] save` and `prefs` warnings use generic errors |
| Service worker | `chrome://extensions` → Service worker; clip, toggle, popout, native/peer sync warnings |
| Popup/popout | Inspect the extension page; popup settings also show connection/save failures |
| Peer daemon | `peer.log`, foreground terminal, and loopback status/test results |

`console.warn` reports a failed save or optional boundary. Expected states such as a locked
vault or a wrong passphrase are handled by the UI. Peer absence is logged once per outage.
A successful unchanged sync is quiet. Do not claim silent persistence success after a failed
write or read-back verification.

## Shape and privacy

Use a stable subsystem and a small metadata object:

```js
console.warn('[stickysites] save', { error: 'NOTE_WRITE_FAILED' });
```

Never log note bodies, to-do/outline text, passphrases, cached JWKs, verify envelopes, or salt.
Daemon logs can contain configured paths, peer names, and addresses; treat them as local
operational information. Avoid placing raw external error strings or snapshot content into
new logs. Extension ids, key names, counts, and fixed error codes are usually sufficient.

## Actionable outcomes

| Code/state | Meaning |
|---|---|
| `STATE_CHANGED` | Native/peer input changed while work was pending; newer state is retained |
| `STORAGE_VERIFY_FAILED` | A queued write did not match read-back; surface failure |
| `VAULT_LOCKED` / `VAULT_UNREADABLE` | The writer refuses to overwrite protected/unreadable state |
| `NETWORK_TIMEOUT` | Request or JSON response body exceeded its deadline |
| `NATIVE_TIMEOUT` | Native reply exceeded its separate deadline |
| Daemon config/snapshot persistence error | HTTP 500; last successful in-memory/disk state is retained |
| Unknown diagnostic certificate | TLS step fails before sending a bearer; verify key/discovery |

Read-side helpers can still return defaults or an envelope while locked. These neutral states
do not authorize a later writer to replace unreadable content; the queued writer checks fresh
state. Cosmetic selection/highlight failures may remain quiet. Test logs with
`vi.spyOn(console, 'warn')` when their behavior matters; actual-script fixtures can exercise
runtime warnings without opening a browser or exposing real data.
