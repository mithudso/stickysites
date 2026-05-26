# StickySites

Sticky notes for every website. A Chrome Extension (v1.7.0) with five note types, a floating
draggable icon cluster, a rich-text workspace panel, full-text search, markdown export,
AES-256-GCM encryption at rest, and Google Drive sync.

## Note types

| Color | Scope | Description |
|-------|-------|-------------|
| **Yellow** | Global | One shared note visible on every site |
| **Green** | Site / Domain | One note per domain |
| **Blue** | Page / URL | One note per exact URL |
| **Purple** | To-do list | Checkbox task list, per-page or global |
| **Orange** | Outliner | Hierarchical bullet outline |

## Features

- **Floating icon cluster** — draggable button cluster on every page; Alt+S toggles it; keys 1–5
  open the corresponding note type
- **Workspace panel** — rich text editor with bold, italic, headings, ordered/unordered lists,
  and inline `#tags`
- **Browser action popup** — all-notes view with full-text search, sort, and filter by type or tag
- **Right-click context menu** — clip highlighted text directly into any note type
- **Keyboard shortcuts** — Alt+S toggles the cluster; while the cluster is focused, 1–5 opens
  the matching note type
- **Markdown export** — export a single note or all notes as `.md` files
- **Encryption at rest** — opt-in AES-256-GCM encryption stored in Chrome local storage
- **Google Drive sync** — OAuth-based auto-sync; see [setup instructions](#google-drive-setup)
- **Auto-save** — notes save after 500 ms of inactivity and sync across tabs in real time

## Install

1. Clone this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select this directory

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for full instructions including update and
uninstall steps.

## Usage

### Opening notes

- The floating icon cluster appears on the right edge of every page
- Click any colored icon to open that note type, or use **Alt+S** to toggle the cluster, then
  press **1–5** to open a note
- Click the extension toolbar icon to open the all-notes popup

### Writing notes

- Type in the workspace panel; changes auto-save after 500 ms
- Use the toolbar for **bold**, *italic*, headings, and lists
- Add `#tags` inline to organise notes

### Clipping text

- Select any text on a page, right-click, and choose **Add to StickySites** to send it to a
  note type of your choice

### Searching and filtering

- Click the toolbar icon to open the popup
- Search across all notes with the search bar
- Filter by note type (Yellow / Green / Blue / Purple / Orange) or by tag
- Sort by date created, date modified, or alphabetically

### Exporting

- Open a note, then use the **Export** button to download it as a `.md` file
- Use **Export All** in the popup to bulk-download all notes as a zip of markdown files

### Encryption

- Open the extension options page and enable **Encrypt notes at rest**
- Notes are encrypted with AES-256-GCM before being written to Chrome Storage
- You will be prompted to set (and confirm) a passphrase; the passphrase is never stored

## Google Drive setup

1. Open the extension options page (`chrome://extensions` → Details → Extension options)
2. Click **Connect Google Drive** and complete the OAuth flow
3. Choose a sync frequency (on-change, every 15 min, hourly, or manual)
4. Notes are stored as JSON in a `StickySites/` folder in your Drive
5. To disconnect, click **Disconnect** on the options page; local notes are not deleted

## Development

```bash
npm install          # install dev dependencies (vitest)
npm test             # run unit tests
npm run test:watch   # tests in watch mode
```

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for debugging tips, conventions, and packaging
instructions.

## Documentation

| Document | Contents |
|----------|----------|
| [Architecture](docs/ARCHITECTURE.md) | System context, data flow, storage schema, design decisions |
| [Codebase overview](docs/codebase-overview.md) | File-by-file module map |
| [Components](docs/COMPONENTS.md) | Module-by-module API reference |
| [Development](docs/DEVELOPMENT.md) | Setup, commands, conventions, debugging |
| [Installation](docs/INSTALLATION.md) | Install, update, and uninstall |
| [Security](docs/SECURITY.md) | Threat model, permissions audit, encryption details |
| [Testing](docs/TESTING.md) | Test framework, mocking, coverage priorities |
| [Known Issues](docs/known-issues.md) | Bugs and limitations |

## Tech stack

- Chrome Extension Manifest V3
- Vanilla JavaScript (no frameworks, no build step)
- Vanilla CSS with Tailwind-inspired Slate palette
- Vitest for unit testing
- Web Crypto API (AES-256-GCM) for encryption at rest
- Google Drive REST API + Chrome Identity API for sync

## License

MIT
