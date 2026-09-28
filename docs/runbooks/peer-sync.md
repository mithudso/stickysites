# Runbook: local peer sync between laptops

Two or more machines on the same LAN keep their StickySites notes converged through the peer
helper (`peer/stickysites-peer.py`). Design and security model: `peer/README.md`.

**Precondition**: Python 3.9+ and `openssl` on each machine; both on the same Wi-Fi/LAN subnet
(discovery uses multicast **and** subnet broadcast on every real interface, so a VPN holding the
default route is fine; guest networks with client isolation are not).

## Set up

1. First laptop:
   ```bash
   python3 /Users/mitch/dev/stickysites/peer/stickysites-peer.py install
   ```
   Copy the pairing key it prints.
2. Every other laptop (same repo checkout or a copy of `peer/stickysites-peer.py`):
   ```bash
   python3 /Users/mitch/dev/stickysites/peer/stickysites-peer.py install --pair-key <KEY>
   ```
3. Reload the extension on each machine (`chrome://extensions` → ↻) so the service worker
   picks up the first sync; or open the popup → Settings → **Local Peer Sync** → **Sync now**.

## Verify

- `python3 peer/stickysites-peer.py status` on either machine lists the other under `peers`.
- Popup → Settings → Local Peer Sync shows "In sync with <name>".
- Edit a site note on one laptop; within ~5 s (4 s debounce + push) plus the other side's
  next minute tick it appears there. Force it with **Sync now**.

## Encryption

Enable encryption on **one** laptop only. The other adopts that vault on its next sync, shows
the lock overlay, and takes the same passphrase. "Encryption mismatch" means both were enabled
separately: disable on one, let it sync, re-enable there if wanted.

## Troubleshooting

| Symptom | Action |
|---|---|
| Popup: "Peer helper not running on this machine" | `launchctl list \| grep com.stickysites.peer`; `tail ~/.stickysites/peer.log`; re-run `install` |
| Popup: "no other laptop seen yet" | Same subnet? `pair` shows the same key on both? Firewall: allow inbound TCP 47832 + UDP 47833. VPN with "block LAN access" on? A lone `announce via … to 239.255.77.31 failed: No route to host` in the log is harmless — the broadcast path still delivers |
| Log: `fetch from X failed: unreachable on …` | The peer's announced addresses are not routable from here (VPN/utun). Both machines must share a subnet; the daemon tries every address it was told about |
| Log: `certificate fingerprint mismatch` | The peer reinstalled and rotated its cert while an old announcement was cached; clears itself within 20 s |
| Notes resurrect after deletion | Only outline docs write tombstones today; other note types have no delete path in the UI, so nothing to resurrect. See `known-issues.md` |

## Escalation

Run both daemons in the foreground (`run`) and watch the logs; the two-daemon test
`npm run test:peer` reproduces discovery + fetch on one machine.

## Remove

`python3 peer/stickysites-peer.py uninstall` (keeps `~/.stickysites/`; delete it to purge the
last snapshot), then toggle Peer sync **Off** in the popup.
