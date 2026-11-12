/** Owned-resource lifecycle for the opt-in browser harnesses. Importing starts nothing. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveChrome({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  const usable = (file) => {
    try { fs.accessSync(file, fs.constants.X_OK); return fs.statSync(file).isFile(); } catch { return false; }
  };
  if (env.SS_CHROME) {
    if (!usable(env.SS_CHROME)) throw new Error('SS_CHROME must point to an existing executable Chrome for Testing or Chromium binary.');
    return env.SS_CHROME;
  }
  const cache = path.join(home, '.cache/puppeteer/chrome');
  const suffixes = platform === 'darwin'
    ? ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']
    : platform === 'win32' ? ['chrome-win64/chrome.exe', 'chrome-win32/chrome.exe'] : ['chrome-linux64/chrome', 'chrome-linux/chrome'];
  let versions = [];
  try { versions = fs.readdirSync(cache).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })); } catch { /* clear setup diagnostic below */ }
  for (const version of versions) {
    for (const suffix of suffixes) {
      const file = path.join(cache, version, suffix);
      if (usable(file)) return file;
    }
  }
  throw new Error('No Chrome for Testing executable found in the current home cache. Set SS_CHROME to an available Chrome for Testing or Chromium binary.');
}

function withDeadline(action, timeoutMs, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} cleanup timeout after ${timeoutMs} ms`)), timeoutMs); });
  return Promise.race([Promise.resolve().then(action), timeout]).finally(() => clearTimeout(timer));
}

export function createHarnessResources({ tempRoot = os.tmpdir(), closeTimeoutMs = 10000 } = {}) {
  if (!Number.isFinite(closeTimeoutMs) || closeTimeoutMs <= 0) throw new Error('closeTimeoutMs must be a positive finite number.');
  const directories = [];
  const browsers = new Set();
  const servers = new Set();
  return {
    tempDir(prefix, { preserve = false } = {}) {
      const directory = fs.mkdtempSync(path.join(tempRoot, prefix));
      if (!preserve) directories.push(directory);
      return directory;
    },
    ownBrowser(browser) { browsers.add(browser); return browser; },
    ownServer(server) { servers.add(server); return server; },
    async closeBrowser(browser) {
      if (!browsers.has(browser)) return;
      await withDeadline(() => browser.close(), closeTimeoutMs, 'Browser');
      browsers.delete(browser);
    },
    async cleanup() {
      const errors = [];
      for (const browser of [...browsers].reverse()) {
        try { await this.closeBrowser(browser); } catch (error) { errors.push(error); }
      }
      for (const server of servers) {
        try {
          await withDeadline(() => new Promise((resolve, reject) => {
            server.close((error) => {
              if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error); else resolve();
            });
            // These are exclusively owned fixture servers. No request needs to
            // finish once the harness action has ended.
            server.closeAllConnections?.();
          }), closeTimeoutMs, 'Server');
          servers.delete(server);
        } catch (error) { errors.push(error); }
      }
      // A failed browser close can mean Chrome still owns its profile. Preserve
      // directories in that case and report the cleanup failure for manual review.
      if (!browsers.size && !servers.size) {
        for (const directory of directories.reverse()) {
          try { fs.rmSync(directory, { recursive: true, force: true }); } catch (error) { errors.push(error); }
        }
      }
      return errors;
    },
  };
}

export async function withHarnessResources(action, options) {
  const resources = createHarnessResources(options);
  let failure, result, errors;
  try { result = await action(resources); }
  catch (error) { failure = error instanceof Error ? error : new Error(String(error), { cause: error }); }
  finally { errors = await resources.cleanup(); }
  if (failure) {
    if (errors.length) failure.cleanupErrors = errors;
    throw failure;
  }
  if (errors.length) throw new AggregateError(errors, 'Harness resource cleanup failed; owned temporary state may remain.');
  return result;
}

export async function listen(server, host = '127.0.0.1') {
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(0, host, () => { server.removeListener('error', onError); resolve(); });
  });
  return server.address().port;
}
