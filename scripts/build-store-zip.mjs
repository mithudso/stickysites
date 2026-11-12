#!/usr/bin/env node
/**
 * Builds the Chrome Web Store upload package: dist/stickysites-<version>.zip containing ONLY
 * the files Chrome needs (manifest, icons, src, popup, popout). Dev tooling, tests, docs,
 * llms files, dotfiles, and the store/ assets are excluded.
 *
 * Usage: npm run build:store       → dist/stickysites-1.11.1.zip + a printed file listing
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) {
  console.error(`version drift: manifest.json ${manifest.version} vs package.json ${pkg.version}`);
  process.exit(1);
}

const INCLUDE = ['manifest.json', 'icons', 'src', 'popup.html', 'popup.js', 'popup.css', 'popout.html', 'popout.js', 'popout.css'];
for (const p of INCLUDE) {
  if (!existsSync(path.join(repoRoot, p))) { console.error(`missing ${p}`); process.exit(1); }
}

const distDir = path.join(repoRoot, 'dist');
mkdirSync(distDir, { recursive: true });
const zipPath = path.join(distDir, `stickysites-${manifest.version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);

// Give zip individual regular files. Recursive zip follows links and includes hidden
// descendants, so neither recursion nor a top-level denylist is safe here.
function runtimeFiles(relative) {
  if (relative.split('/').some((part) => part.startsWith('.'))) return [];
  const full = path.join(repoRoot, relative);
  const stat = lstatSync(full);
  if (stat.isSymbolicLink()) return [];
  if (stat.isDirectory()) {
    return readdirSync(full).sort().flatMap((name) => runtimeFiles(`${relative}/${name}`));
  }
  if (!stat.isFile()) return [];
  if (relative.startsWith('src/') && !/\.(js|css)$/.test(relative)) return [];
  if (relative.startsWith('icons/') && !/\.png$/.test(relative)) return [];
  return [relative];
}
const files = INCLUDE.flatMap(runtimeFiles).sort();
for (const required of INCLUDE.filter((file) => path.extname(file))) {
  if (!files.includes(required)) throw new Error(`Required runtime file is not a regular file: ${required}`);
}
execFileSync('zip', ['-X', zipPath, ...files], { cwd: repoRoot, stdio: 'ignore' });

const listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split('\n');
const bad = listing.filter((f) => !files.includes(f) || f.split('/').some((part) => part.startsWith('.')));
if (listing.length !== files.length) bad.push('archive file count differs from the approved runtime file list');
if (bad.length) {
  console.error('unexpected files in package:\n  ' + bad.join('\n  '));
  rmSync(zipPath, { force: true });
  process.exit(1);
}
const kb = (statSync(zipPath).size / 1024).toFixed(1);
console.log(`${path.relative(repoRoot, zipPath)} — ${listing.length} files, ${kb} KB`);
for (const f of listing) console.log('  ' + f);
