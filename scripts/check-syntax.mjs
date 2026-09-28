#!/usr/bin/env node
/**
 * Syntax gate for a repo with no bundler and no transpiler: runs `node --check` over every
 * JavaScript file Chrome or Node will load, so a stray brace in a content script fails CI
 * instead of silently breaking the extension on every page.
 *
 * Node 22.7+ detects ESM vs classic syntax per file, so both the `import`-style shared modules
 * and the namespace-style content scripts parse without flags.
 *
 * Usage: node scripts/check-syntax.mjs        (npm run lint)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'docs', 'icons', '.remember', 'coverage', 'dist']);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(m?js)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(repoRoot, []).sort();
let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (err) {
    failed++;
    console.error(`✖ ${path.relative(repoRoot, file)}\n${err.stderr?.toString() ?? err.message}`);
  }
}

// manifest.json and package.json must parse and agree on the version.
try {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) {
    failed++;
    console.error(`✖ version drift: manifest.json ${manifest.version} vs package.json ${pkg.version}`);
  }
} catch (err) {
  failed++;
  console.error(`✖ manifest.json / package.json: ${err.message}`);
}

if (failed) {
  console.error(`\n${failed} problem${failed === 1 ? '' : 's'} in ${files.length} files`);
  process.exit(1);
}
console.log(`✔ ${files.length} JavaScript files parse; manifest.json and package.json versions agree`);
