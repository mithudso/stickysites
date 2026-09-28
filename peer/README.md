# StickySites peer helper — local network sync

Keeps two or more laptops' StickySites notes converged **over the local network only** — no
account, no cloud, no server. A tiny Python daemon (stdlib only, Python 3.9+) runs on each
machine; the extension talks to it on loopback, the daemons talk to each other on the LAN.

```
laptop A                                             laptop B
┌──────────────┐  http 127.0.0.1:47831  ┌──────────┐    ┌──────────┐  http 127.0.0.1:47831  ┌──────────────┐
│ StickySites  │ ─PUT /snapshot───────▶ │ peer     │◀──▶│ peer     │ ◀───────PUT /snapshot─ │ StickySites  │
│ (service     │ ◀GET /peers/snapshots─ │ daemon   │    │ daemon   │ ─GET /peers/snapshots▶ │ (service     │
│  worker)     │                        └──────────┘    └──────────┘                        │  worker)     │
└──────────────┘      discovery: UDP multicast 239.255.77.31:47833 + subnet broadcast :47833 (HMAC-signed with the pairing key)
                      transport: HTTPS :47832, self-signed cert pinned by fingerprint, bearer token from the pairing key
```

## Install (each laptop)

```bash
# first laptop — prints a pairing key
python3 /Users/mitch/dev/stickysites/peer/stickysites-peer.py install

# every other laptop — same key
python3 /Users/mitch/dev/stickysites/peer/stickysites-peer.py install --pair-key <KEY>
```

`install` writes `~/.stickysites/peer.json` (id, name, pairing key, ports), generates a
self-signed certificate with `openssl`, and on macOS loads a launchd agent
(`~/Library/LaunchAgents/com.stickysites.peer.plist`) so the daemon starts at login and stays up.
Then open the extension popup → Settings → **Local Peer Sync** shows the peers it can see.

Other commands: `status` (peers seen by the running daemon), `pair [KEY]` (show / change the
key; restart after changing), `uninstall` (removes the launchd job; keeps `~/.stickysites/`),
`run` (foreground, for debugging), `init` (config + cert only).

### Discovery on VPNs and locked-down networks

Announcements go out every 5 s on **every non-tunnel interface** (Wi-Fi, Ethernet), as UDP
multicast **and** as a subnet broadcast (`192.168.1.255`-style), because corporate VPN clients and
endpoint agents commonly capture or drop multicast (on macOS a VPN `utun` often owns the
`224.0.0/4` route). Tunnel (point-to-point) interfaces are never used for discovery, but their
address is still advertised in case that is the only path to a peer. Interfaces are re-scanned
every 60 s, so joining a VPN or switching Wi-Fi needs no restart.

If neither multicast nor broadcast crosses your network (segmented Wi-Fi, "client isolation"),
give each daemon the others' addresses — announcements are then also unicast to them:

```bash
python3 peer/stickysites-peer.py install --pair-key KEY --peer 192.168.1.50 --peer 192.168.1.51
```

(`static_peers` in `~/.stickysites/peer.json`; restart after editing by hand.)

Linux: run `python3 stickysites-peer.py run` under systemd —

```ini
[Unit]
Description=StickySites peer sync
[Service]
ExecStart=/usr/bin/python3 /path/to/stickysites/peer/stickysites-peer.py run
Restart=always
[Install]
WantedBy=default.target
```

## How syncing works

- Every minute (and 4 s after you edit a note) the extension's service worker pushes a
  **snapshot** — all six note keys as stored, plus tombstones for deleted outline docs — to
  its local daemon and pulls every peer's latest snapshot back.
- Merge is **record-level last-writer-wins** on each record's `updatedAt` (site, page, daily
  and outline records individually; the global note and the to-do list as one record each).
  Ties keep the local copy. A deletion tombstone newer than the record deletes it everywhere.
- Preferences, the cluster position, and the cached vault key are **not** synced.
- Daemons only relay: they never inspect or merge notes. `~/.stickysites/snapshot.json` holds
  the last snapshot the local extension pushed (mode 0600).

## Encryption

Snapshots carry notes exactly as stored, so with the vault on they are `{ iv, data }`
envelopes end-to-end. Rules:

| Laptop A | Laptop B | Result |
|---|---|---|
| off | off | plain merge |
| on, unlocked | off | A merges B's plaintext and writes encrypted; B **adopts A's vault config** on its next sync, locks, and asks for A's passphrase — after that both are encrypted with the same key |
| on, locked | anything | A skips merging until unlocked (status "Vault locked") |
| on (salt 1) | on (salt 2) | "Encryption mismatch": disable encryption on one laptop, let it sync, re-enable if you like |

Enable encryption on **one** laptop and let the others adopt it.

## Security model

- Nothing leaves the LAN. Peers must hold the same pairing key: announcements are HMAC-signed
  with it (unsigned/foreign announcements are dropped) and every LAN request carries a bearer
  token derived from it.
- LAN transport is HTTPS with a per-machine self-signed certificate whose SHA-256 fingerprint is
  carried in the signed announcement and pinned by the fetching peer.
- The loopback API accepts requests only from `chrome-extension://` origins on `127.0.0.1`.
  Any extension installed in a browser on that machine could reach it — same trust level as
  the Chrome profile itself.
- Without the vault, notes are plaintext at rest on each machine (as they already are in
  Chrome's storage) and plaintext inside the TLS tunnel. Turn on encryption for at-rest
  protection on all machines at once.

## Troubleshooting

| Symptom | Check |
|---|---|
| Popup says "Peer helper not running" | `python3 peer/stickysites-peer.py status`; `launchctl list \| grep stickysites`; log at `~/.stickysites/peer.log` |
| "no other laptop seen" | Same Wi-Fi/LAN? Same pairing key (`pair`)? Firewall allowing inbound TCP 47832 and UDP 47833? Client isolation on the Wi-Fi → use `--peer` (see *Discovery on VPNs*). `~/.stickysites/peer.log` lists the interfaces announced on |
| Fetch from peer fails in the log | Certificate changed after reinstall → the announcement carries the new fingerprint automatically; a stale `lastSeen` entry expires in 20 s |
| "Encryption mismatch" | See the table above |
| Two daemons on one machine (testing) | Use `init` with distinct `--loop-port`/`--lan-port` and a shared `--mcast-port`; see `peer/test_peer.py` |

Tests: `python3 -m unittest peer/test_peer.py` (spins up two daemons on ephemeral ports).
