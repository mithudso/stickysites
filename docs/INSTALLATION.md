# Installation

## Developer install (from source)

### Prerequisites

- Chrome or Chromium-based browser (Edge, Brave, Arc)
- Node.js 22+ (only needed if running tests)
- Git

### Steps

1. Clone the repository:
   ```bash
   git clone <repo-url>
   cd stickysites
   ```

2. Install dev dependencies (optional, for tests only):
   ```bash
   npm install
   ```

3. Load the extension in Chrome:
   - Navigate to `chrome://extensions`
   - Enable **Developer mode** (toggle in top-right corner)
   - Click **Load unpacked**
   - Select the `stickysites/` directory (the repo root)

4. Verify: the StickySites icon appears in the toolbar, and yellow + green
   buttons appear on the right edge of any webpage.

### Updating

After pulling new changes:
1. Go to `chrome://extensions`
2. Click the reload icon on the StickySites card

### Uninstall

- `chrome://extensions` → click **Remove** on the StickySites card
- Delete the local repo directory

## Chrome Web Store install

Not yet published. See [docs/DEVELOPMENT.md](DEVELOPMENT.md) for packaging
instructions.
