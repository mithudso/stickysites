# Phase 3: Rich Text Editor

**Date:** 2026-05-26
**Status:** Approved
**Scope:** Replace textarea with contenteditable div, add formatting toolbar, HTML storage, auto-convert legacy plain-text notes

## Summary

Replace the plain textarea in the workspace panel with a contenteditable
div and a formatting toolbar. Notes are stored as HTML going forward. Existing
plain-text notes are auto-converted to HTML at display time (no migration).

## Security Note

All note content is user-authored and stored locally in chrome.storage.local.
There is no external/untrusted input. The contenteditable div renders the
user's own HTML from their own storage. No sanitization library is needed
because the threat model has no untrusted content source.

## Decisions

| Decision | Choice | Alternatives considered |
|----------|--------|------------------------|
| Editor approach | contenteditable + execCommand | Tiptap/Quill library, markdown+preview |
| Toolbar options | Full set (19 tools) | Essential (8), Minimal (4) |
| Legacy migration | Auto-convert on read | One-time migration script |
| Storage format | HTML string in body field | No schema change, body is now HTML |

## Toolbar Tools

| Tool | execCommand | UI |
|------|------------|-----|
| Bold | bold | B button |
| Italic | italic | I button |
| Underline | underline | U button |
| Strikethrough | strikethrough | S button |
| Heading 1 | formatBlock H1 | H1 button |
| Heading 2 | formatBlock H2 | H2 button |
| Heading 3 | formatBlock H3 | H3 button |
| Bulleted list | insertUnorderedList | bullet button |
| Numbered list | insertOrderedList | number button |
| Checkbox | insertHTML (label+input) | checkbox button |
| Align left | justifyLeft | align button |
| Align center | justifyCenter | align button |
| Align right | justifyRight | align button |
| Horizontal rule | insertHorizontalRule | hr button |
| Font family | fontName | select dropdown |
| Font size | fontSize | select dropdown |
| Text color | foreColor | color input |
| Indent | indent | indent button |
| Outdent | outdent | outdent button |

## Architecture

### Modified files

| File | Change |
|------|--------|
| src/content/panel.js | Replace textarea with contenteditable div + toolbar |
| src/content/sticky-inject.css | Add toolbar and editor styles |
| popup.js | Update subject/preview extraction to handle HTML bodies |

### No new files needed

The toolbar is built inline in panel.js using the same DOM construction
pattern as the rest of the panel.

## Panel Changes

### Toolbar rendering

A horizontal toolbar between the action buttons row and the editor area.
Two rows:
- Row 1: B, I, U, S, H1, H2, H3, bullet, number, checkbox, align-L, align-C, align-R, hr, indent, outdent
- Row 2: Font family dropdown, Font size dropdown, Color picker

Each button calls document.execCommand(command, false, value) and refocuses
the editor.

### Editor area

Replace textarea with a contenteditable div.
Set content from stored body (HTML) or auto-converted plain text.
Listen to input event for debounced auto-save.
Save the div's content to storage.

### Auto-convert legacy plain text

When reading a note body, detect if it is plain text or HTML:

```js
function isHtml(str) {
  return /^<[a-z][\s\S]*>/i.test(str.trim());
}

function plainTextToHtml(text) {
  if (!text) return '';
  return text.split('\n').map(function (line) {
    var escaped = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return '<p>' + (escaped || '<br>') + '</p>';
  }).join('');
}
```

Apply on read: if body is not HTML, convert with plainTextToHtml(body).

### Subject extraction update

The getSubject function (used in popup.js) needs to handle HTML by
extracting text content from the HTML before taking the first line.

### Copy button update

The Copy button strips HTML and copies plain text using textContent.

## CSS Changes

Toolbar: flex-wrap row with small buttons, dark background.
Editor: flex-1 scrollable area, Inter font, 13px, outline none.
Styles for headings, lists, checkboxes, and hr within the editor.

## Font Options

Font family: System default, Serif, Monospace, Inter, Georgia, Courier New
Font size: Small (11px), Normal (13px), Large (16px), XL (20px)

Implemented as select dropdowns in toolbar row 2.

## Storage

No schema changes. The body field in all note types now contains HTML instead
of plain text. The v1 key suffix stays. This is a format change within the
same schema version, handled by the auto-convert-on-read approach.

## Out of Scope

| Feature | Phase |
|---------|-------|
| To-do list icon | 4 |
| Outliner icon | 4 |
| Export to Google Docs / Apple Notes | 5 |
