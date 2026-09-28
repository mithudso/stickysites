# Runbook: to-do ↔ TODO.md sync is not happening

The global to-do list optionally syncs with a local `TODO.md` through the native-messaging
host `com.mitch.todo_bridge` (`src/shared/todo-bridge.js`, driven by
`src/background/service-worker.js`). Without the host the extension works normally and the
list stays local.

**Precondition**: the `todo` skill is present at `~/.claude/skills/todo/`.

## Steps

1. **Is the host installed for this browser?** The manifest lives at
   `~/Library/Application Support/<Browser>/NativeMessagingHosts/com.mitch.todo_bridge.json`
   (Chrome, Chrome Beta, Chromium, Brave, Arc each have their own directory). Install or
   refresh for every profile on the machine:
   ```bash
   python3 ~/.claude/skills/todo/scripts/todo.py install-native-host
   ```
   It finds StickySites' unpacked extension id in each browser profile and writes
   `allowed_origins`.
2. **Does the manifest point at an executable?** `path` must be
   `~/.claude/skills/todo/scripts/todo_host` and it must be `chmod +x`.
3. **Is the extension id in `allowed_origins`?** Compare with the id shown on the
   StickySites card at `chrome://extensions`. Ids change if you load the unpacked folder
   from a different path — re-run step 1.
4. **Reload the extension** (↻ on the card) after any manifest change.
5. **Read the service-worker console** (`chrome://extensions` → Service worker). A
   `[stickysites] todo-sync` warning carries the host's error text
   (`Specified native messaging host not found`, `Access to the specified native messaging
   host is forbidden`, …).
6. **Is the vault locked or encrypted?** Sync is skipped while `stickysites_todos_v1` is an
   `{ iv, data }` envelope — by design, plaintext never reaches the file. Disable
   encryption or accept local-only to-dos.

## Verification

Edit a to-do in the panel; within ~3 s the item appears in `TODO.md`. Edit `TODO.md`;
within 2 minutes (or after an extension reload) the panel reflects it.

## Escalation

Run the host by hand to see its own errors:
```bash
echo '{"cmd":"sync","ext":"test","items":[],"sections":[]}' | python3 ~/.claude/skills/todo/scripts/todo.py native-host
```
(Native messaging frames messages with a 4-byte length prefix, so a plain pipe may be
rejected; the error text still tells you whether the script itself runs.)
