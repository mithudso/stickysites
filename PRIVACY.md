# StickySites Privacy Policy

_Last updated: 2026-09-27_

StickySites is a Chrome extension that lets you keep notes attached to websites, pages, and
dates, plus a to-do list and an outliner. This policy explains what the extension does with
your data. The short version: **everything stays on your device; nothing is sent to us or to
any third party.**

## What the extension stores

- The notes, to-do items, and outlines you write, and the settings you choose (cluster
  position, layout, which note types are visible, panel size).
- If you turn on encryption: a random salt, an encrypted verification token, and — while the
  vault is unlocked — the derived encryption key. Your passphrase itself is never stored.

All of this is kept in Chrome's extension storage (`chrome.storage.local`) on your computer.
It is not synced through Google, not uploaded anywhere, and not accessible to websites you
visit or to other extensions.

## What the extension reads from web pages

- The page's address (hostname and path) — to decide which site/page note to show and to
  draw the small identity icons.
- Text you have **selected and explicitly chosen to clip** through the right-click
  "StickySites" menu. Nothing else on the page is read, and no page content is read
  automatically.

## Network

StickySites makes **no network requests**. It has no servers, no analytics, no telemetry,
no crash reporting, no advertising, and loads no remote code or resources.

## Optional local to-do sync (native messaging)

If you install the optional companion program on your own computer, the extension can keep
your to-do list in sync with a local Markdown file. In that case the to-do items (text, done
state, notes, sections) are passed to that local program through Chrome's native-messaging
channel. This never leaves your machine, and the sync is skipped entirely while encryption is
turned on. Without the companion program installed, the feature is simply inactive.

## Encryption

Encryption is optional. When enabled, your notes are encrypted at rest with AES-256-GCM using
a key derived from your passphrase (PBKDF2, 600,000 iterations). We cannot recover your notes
if you forget the passphrase, because we never see it.

## Data sharing and sale

We do not collect, transmit, sell, or share any personal data. There is nothing to share.

## Permissions

| Permission | Why it is needed |
|---|---|
| `storage` | Save your notes and settings locally |
| `activeTab` | Open or toggle the note panel on the tab you are looking at |
| `contextMenus` | The right-click "StickySites" clip menu |
| `alarms` | Schedule the optional local to-do sync |
| `nativeMessaging` | Talk to the optional local companion program |
| Access to websites (content script) | Show the floating note cluster and panel on the pages you visit |

## Removing your data

Uninstalling the extension deletes all of its stored data. You can export your notes as
Markdown from the extension popup first.

## Changes

If this policy changes, the updated version will be published at
https://github.com/mithudso/stickysites/blob/main/PRIVACY.md with a new date.

## Contact

Open an issue at https://github.com/mithudso/stickysites/issues or contact the maintainer
listed in the repository.
