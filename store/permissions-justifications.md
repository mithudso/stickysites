# Permission justifications (Privacy tab → Permissions)

One text box per permission in the Developer Dashboard. Each entry below is written to be
pasted verbatim. Keep them factual — reviewers compare against the code.

## `storage`
```
Saves the user's notes, to-do items, outlines, and settings in chrome.storage.local on the
user's device, including vault configuration and sync state. Optional sync can also place
snapshots on paired computers or in a shared/cloud folder selected by the user; the extension
operates no hosted collection service.
```

## `activeTab`
```
Lets the toolbar popup and the Alt+S keyboard command open, switch, or hide the note panel in
the tab the user is currently viewing (chrome.tabs.sendMessage to the active tab). No broad
tabs access, history, or URL collection.
```

## `contextMenus`
```
Adds a "StickySites" submenu to the right-click menu on selected text so the user can clip that
selection into a global, site, page, to-do, outline, or daily note. The selection is only read
when the user chooses one of these menu items.
```

## `alarms`
```
Schedules the optional local to-do sync every two minutes (MV3 service workers cannot keep
timers alive), and optional peer sync every minute. Native to-do sync skips while the vault
is enabled; missing optional helpers leave notes in local storage and report local status.
```

## `nativeMessaging`
```
Optional feature: mirrors the user's to-do list into a Markdown file on their own computer via
a companion program the user installs manually (a native-messaging host registered in the
browser). Data flows only between the extension and that local process — no network. Without
the host installed, the boundary reports a local failure and the extension still works.
```

## Host permission — content script on `<all_urls>`
```
The core feature is a note attached to whatever website or page the user is on, so the content
script that draws the floating note cluster and panel must run on every page. It reads only the
page URL (to pick the site/page note and draw the identity icons) and text the user explicitly
selects and clips. It does not automatically scrape page content or inject ads. Optional
paired sync can transfer note snapshots through the local helper or a chosen shared/cloud
folder, as disclosed in the privacy policy.
```

## Remote code
```
No remote code. All scripts are packaged in the extension; there is no eval, no fetched
JavaScript, and no external resources.
```
