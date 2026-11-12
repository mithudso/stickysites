# StickySites Privacy Policy

_Last updated: 2026-11-12_

StickySites keeps notes attached to websites, pages, and dates, plus a to-do list and an
outliner. Notes are stored locally by default. We operate no hosted collection service,
analytics, telemetry, crash reporting, or advertising. Optional sync sends data only through
the local programs, paired computers, and shared/cloud folder you choose.

## What the extension stores

- Notes, to-do items, outlines, deletion markers, sync status, and your settings.
- If encryption is enabled: a random salt, an encrypted verification token, and a cached
  derived key while unlocked. The passphrase itself is never stored.

The extension uses `chrome.storage.local`, not Chrome's account-sync storage. The cached
key deliberately persists across browser restarts until **Lock Now**. Other extensions do
not have direct access to this extension's storage. An open in-page note panel is part of
the host page's DOM: that page's scripts can read its displayed plaintext. Encryption at
rest does not hide content while you display it on a page.

## What the extension reads from web pages

- Hostname and path identify the site/page note and its icon.
- Selected text is read when you explicitly choose a StickySites clipping menu item.

StickySites does not automatically scrape page content. Imported rich-text HTML is filtered
before display to remove scripts, event attributes, embedded resource nodes, and unsafe URLs.

## Network and optional sync

The extension loads no remote code or resources and sends no hosted telemetry. It can call
an optional helper on `127.0.0.1`. That helper can exchange snapshots over a paired LAN or
write them to your chosen shared/cloud folder. These optional boundaries are described below.

### Local to-do sync

If you install the optional native-messaging host, the extension sends to-do item text,
done state, notes, sections, and identifiers to that local program so it can synchronize a
Markdown file. The extension skips this sync while the vault is enabled or the to-do value
is encrypted. The extension itself does not upload that file; a folder synchronization
service you independently use may transfer it under that service's terms.

### Paired LAN sync

If you enable peer sync and install `peer/stickysites-peer.py`, the extension passes a
snapshot to its local helper over loopback. Helpers authenticate discovery with a shared
pairing key and exchange snapshots over HTTPS with certificate fingerprints pinned from
those signed announcements. The helper stores the latest snapshot on your computer.
Without the helper, peer sync is unavailable; it can be switched off in Settings.

### Shared or cloud folder

You may configure a sync folder, including a network share or a Google Drive, iCloud Drive,
or Dropbox folder. Each helper writes a signed snapshot file there and reads paired peers'
files. Your chosen provider may store and transfer those files outside your device or LAN,
under its own terms. StickySites does not operate that provider or receive those files.
Clear the folder setting to stop future writes; delete existing copies separately.

## Encryption

Encryption is optional: AES-256-GCM with PBKDF2-SHA256 and 600,000 iterations derives a key
from your passphrase. With the vault enabled, the six note buckets travel as encrypted
envelopes. Deletion markers (including record keys and timestamps), crypto configuration,
device names/identifiers, and folder-signature metadata remain readable. With encryption
off, snapshots and shared-folder files contain plaintext notes. Folder signatures authenticate
a file; they do not encrypt it. We cannot recover a forgotten passphrase.

## Data sharing and sale

We do not collect or sell your personal data. Optional transfers occur through the local
host, paired computers, or folder provider you select. Notes and settings serve only the
extension's note-taking and synchronization features.

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Save notes, settings, vault configuration, and sync state locally |
| `activeTab` | Open or toggle a note panel on the active tab |
| `contextMenus` | Offer the explicit clipping menu |
| `alarms` | Schedule optional to-do and peer sync |
| `nativeMessaging` | Talk to the optional local to-do program |
| Content script on websites | Display the floating cluster and panel |

## Removing your data

Export readable notes as Markdown before uninstalling. Removing the extension deletes its
Chrome extension storage. It does not delete the helper's state, local Markdown file,
paired computers' copies, or shared/cloud-folder files; remove those separately if desired.

## Changes and contact

Policy updates appear at https://github.com/mithudso/stickysites/blob/main/PRIVACY.md with a
new date. Contact the maintainer through https://github.com/mithudso/stickysites/issues.
