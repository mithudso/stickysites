# StickySites

Sticky notes for every website. A Chrome Extension (v1.8.0) with six note types, a floating
draggable icon cluster, a rich-text workspace panel with @-mention autocomplete, and
AES-256-GCM encryption at rest.

## Note types

| Color      | Type        | Scope                     |
|------------|-------------|---------------------------|
| Yellow     | Global      | One shared note, visible on every site |
| Green      | Site        | One note per domain |
| Blue       | Page        | One note per exact URL path |
| Purple     | To-do list  | Checkbox task list per site |
| Orange     | Outliner    | Hierarchical bullet outline per site |
| Red        | Daily       | One note per calendar date (YYYY-MM-DD) |

## Features

### Floating icon cluster
- Draggable pill with one icon per note type, anchored to a saved position
- Drag-to-reorder icons within the cluster
- Toggle between horizontal and vertical layout
- **Alt+S** toggles visibility; keys **1**--**5** open note types; **A** cycles through all six
- Number badges appear on icons for 3 seconds after the cluster appears

### Workspace panel
- Moveable (drag header) and resizable (drag bottom-right handle)
- Expand/shrink toggle and popout button
- Rich text editor with a 19-tool formatting toolbar across two rows:
  - **Row 1:** Bold, Italic, Underline, Strikethrough, H1, H2, H3, Unordered list,
    Ordered list, Checkbox, Align left, Align center, Align right, HR, Indent, Outdent
  - **Row 2:** Font family (5 options), Font size (4 sizes), Text color picker
- Inline `#tags` for organizing notes
- Auto-save after 500 ms of inactivity

### @-mention autocomplete
- Type `@` in the editor to trigger an autocomplete dropdown
- Four categories: Link (paste URL, current page URL), Date (today, tomorrow, this week,
  pick date), Contact (name, email), File (file reference)
- Dropdown filters as you type and positions itself near the caret

### Context menus
- Right-click selected text to clip it into any of the six note types via the
  **StickySites** context menu

### Popup dashboard
- Browser action popup with full-text search across all notes
- Sort by Recent, Oldest, or A--Z
- Filter by note type or by active tag
- Export a single note or all notes as markdown
- Settings panel for encryption

### Encryption at rest
- Opt-in AES-256-GCM encryption enabled from the popup Settings panel
- Passphrase-derived key via PBKDF2 (600,000 iterations, SHA-256)
- Derived key cached in `chrome.storage.session` for the browser session
- Lock overlay appears in-page when notes are locked

## Quick start

1. Clone this repository
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select the repo root
4. Click the StickySites toolbar icon or press **Alt+S** on any page

See [docs/INSTALLATION.md](docs/INSTALLATION.md) for full setup details.

## Development

```bash
npm install          # install dev dependencies (vitest)
npm test             # run unit tests (single pass)
npm run test:watch   # run tests in watch mode
```

Tests run in a Node environment and mock Chrome APIs where needed. Requires Node >= 22.

## Tech stack

- Chrome Extension Manifest V3
- Vanilla JavaScript -- no frameworks, no transpilers, no build step
- Web Crypto API (AES-256-GCM) for encryption
- Vitest for unit testing

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
| [Known issues](docs/known-issues.md) | Bugs and limitations |

## License

MIT
