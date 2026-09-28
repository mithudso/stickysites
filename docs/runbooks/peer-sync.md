# Runbook: local peer sync between laptops

Two or more machines on the same LAN keep their StickySites notes converged through the peer
helper (`peer/stickysites-peer.py`). Design and security model: `peer/README.md`.

**Precondition**: Python 3.9+ and `openssl` on each machine; both on the same Wi-Fi/LAN with
multicast or subnet broadcast allowed (the daemon uses both; guest networks with client isolation
block both — configure `--peer IP` on each side, see `peer/README.md`).

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
   Or skip the key flag: after installing, open the popup → Settings → Local Peer Sync, paste the
   first laptop's key into **Pairing key**, click **Save**. Applied live.
   If the laptops do not find each other within a minute, put each laptop's LAN address (shown
   in the other laptop's popup as "This laptop: … · 192.168.x.y") into **Peer IPs** on the
   opposite machine — IP only, port 47833 assumed, comma-separated for several. Firewall: allow
   inbound UDP 47833 (discovery) and TCP 47832 (snapshot exchange).
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

Start with popup → Settings → Local Peer Sync → **Test connection**. It connects to every Peer IP
and every laptop heard on the network and reports the first failing step (`tcp` → `tls` →
`pairing`) with the cause, plus whether the other side is announcing to us.

| Symptom | Action |
|---|---|
| Test: `tcp` fails with `No route to host` while the peer is heard | A VPN is tunnelling the helper: add **StickySites Peer** (`~/Applications`) to its bypass list (Surfshark: Bypasser → Bypass VPN → add app), or allow it in Privacy & Security → Local Network; then `launchctl kickstart -k gui/$(id -u)/com.stickysites.peer` |
| Test: `pairing` fails with 401 | Different pairing keys — copy one to the other laptop and Save |
| Test: `tcp` times out | Wrong IP / helper not running there / firewall blocking TCP 47832 |
| Popup: "Peer helper not running on this machine" | `launchctl list \| grep com.stickysites.peer`; `tail ~/.stickysites/peer.log`; re-run `install` |
| Popup: "no other laptop seen yet" | Same LAN? `pair` shows the same key on both? Firewall: allow inbound TCP 47832 + UDP 47833. VPN with "block LAN" on? |
| Log: `fetch from X failed: unreachable on …` | The peer's announced addresses are not routable from here (VPN/utun). Both machines must share a subnet; the daemon tries every address it was told about |
| Log: `certificate fingerprint mismatch` | The peer reinstalled and rotated its cert while an old announcement was cached; clears itself within 20 s |
| Notes resurrect after deletion | Only outline docs write tombstones today; other note types have no delete path in the UI, so nothing to resurrect. See `known-issues.md` |

## Escalation

Run both daemons in the foreground (`run`) and watch the logs; the two-daemon test
`npm run test:peer` reproduces discovery + fetch on one machine.

## Remove

`python3 peer/stickysites-peer.py uninstall` (keeps `~/.stickysites/`; delete it to purge the
last snapshot), then toggle Peer sync **Off** in the popup.
