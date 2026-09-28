# Installation

## Developer install (from source)

### Prerequisites

- Chrome or a Chromium-based browser (Edge, Brave, Arc, Chrome Beta) with Manifest V3 support
- Git
- Node.js ≥ 22 — only for running tests and tooling

### Steps

1. Clone:
   ```bash
   git clone https://github.com/mithudso/stickysites.git
   cd stickysites
   ```
2. (Optional, tests/tooling) `npm install && npm run lint && npm test`
3. Load: `chrome://extensions` → **Developer mode** on → **Load unpacked** → select the
   `stickysites/` directory (the one containing `manifest.json`)
4. Verify: the StickySites icon appears in the toolbar; on any `http(s)` page a floating
   cluster of colored icons appears (default top-right). Click one, or press `Ctrl/Cmd+F1`,
   to open a note. `Alt+S` hides/shows the cluster.

### Optional: to-do sync with a local `TODO.md`

The global to-do list can mirror into a Markdown file through a native-messaging host that
lives outside this repo (`~/.claude/skills/todo/`). Install it for every browser profile:

```bash
python3 ~/.claude/skills/todo/scripts/todo.py install-native-host
```

Then reload the extension. Without the host the extension works normally and the list stays
in the browser. Troubleshooting: `runbooks/todo-sync-troubleshooting.md`.

### Optional: keep two laptops in sync over the local network

Install the peer helper on each machine with the same pairing key (`peer/README.md`):

```bash
python3 peer/stickysites-peer.py install                 # first laptop — prints the key
python3 peer/stickysites-peer.py install --pair-key KEY  # the others
```

Then popup → Settings → Local Peer Sync shows the peers it can see.

### Updating

```bash
git pull
```
then `chrome://extensions` → ↻ on the StickySites card. If `manifest.json` changed, also
close and reopen the tabs you use.

### Uninstall

- `chrome://extensions` → **Remove** on the StickySites card (this deletes the extension's
  `chrome.storage.local`, i.e. all notes — export first from the popup if you want them)
- Delete the cloned directory
- If installed, remove the native host manifest
  `~/Library/Application Support/<Browser>/NativeMessagingHosts/com.mitch.todo_bridge.json`

## Chrome Web Store

Not yet published. Submission kit (assets, copy, checklist): `store/README.md`; packaging: `runbooks/release-packaging.md`.
