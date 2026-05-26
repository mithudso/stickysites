# Codebase overview

## Root

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome Extension MV3 manifest — declares permissions, content scripts, service worker, icons |
| `package.json` | NPM config — vitest dev dependency, test scripts |
| `CLAUDE.md` | Claude Code project guide |
| `README.md` | User-facing project overview and install instructions |

## `src/background/`

| File | Lines | Purpose |
|------|-------|---------|
| `service-worker.js` | 8 | Listens for toolbar icon click, sends toggle message to active tab |

## `src/content/`

| File | Lines | Purpose |
|------|-------|---------|
| `sticky-inject.js` | 222 | Content script IIFE — builds strip + drawer UI, handles storage reads/writes, cross-tab sync |
| `sticky-inject.css` | 72 | All visual styles — fixed sidebar, glassmorphism drawer, dark theme |

## `src/shared/`

| File | Lines | Purpose |
|------|-------|---------|
| `notes-storage.js` | 101 | ES module with Chrome Storage wrappers — getSiteKey, CRUD for global/site notes, parseTags, debounce |

## `icons/`

| File | Purpose |
|------|---------|
| `icon16.png` | Favicon-size extension icon |
| `icon48.png` | Toolbar and management page icon |
| `icon128.png` | Chrome Web Store and install dialog icon |

## `docs/`

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | System context, data flow, storage schema, design decisions |
| `COMPONENTS.md` | Module-by-module API reference |
| `DEVELOPMENT.md` | Setup, commands, conventions, debugging, packaging |
| `INSTALLATION.md` | Install and uninstall instructions |
| `SECURITY.md` | Threat model, permissions audit, data handling |
| `TESTING.md` | Test framework, mocking strategy, coverage priorities |
| `known-issues.md` | Known bugs and limitations |
