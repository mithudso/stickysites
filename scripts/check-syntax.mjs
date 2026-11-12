#!/usr/bin/env node
/** Parse JavaScript without execution and enforce manifest/package version agreement.
 * Node checks module/CommonJS files. vm.Script also checks classic entry points
 * declared by the manifest and every maintained HTML page, including inline scripts.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKIP_DIRS = new Set(['node_modules', '.git', 'docs', 'icons', '.remember', 'coverage', 'dist']);
const htmlFiles = [];
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) walk(full, out);
    else if (stat.isFile()) {
      if (/\.m?js$/.test(name)) out.push(full);
      else if (/\.html?$/.test(name)) htmlFiles.push(full);
    }
  }
  return out;
}
const files = walk(repoRoot, []).sort();
const available = new Set(files);
const classic = new Set();
let failed = 0;
function problem(name, error) {
  failed++;
  console.error(`✖ ${name}\n${error.stderr?.toString() ?? error.message}`);
}
function classicFile(relative, owner) {
  const full = path.resolve(repoRoot, relative);
  if (!full.startsWith(repoRoot + path.sep) || !available.has(full)) throw new Error(`${owner}: classic script is missing, symlinked, or outside the checkout: ${relative}`);
  classic.add(full);
}
try {
  const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) problem('version drift', new Error(`manifest.json ${manifest.version} vs package.json ${pkg.version}`));
  for (const group of manifest.content_scripts ?? []) {
    for (const file of group.js ?? []) classicFile(file, 'manifest.json');
  }
  if (manifest.background?.service_worker && manifest.background.type !== 'module') classicFile(manifest.background.service_worker, 'manifest.json');
  for (const file of manifest.background?.scripts ?? []) classicFile(file, 'manifest.json');
} catch (error) { problem('manifest.json / package.json', error); }

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? match[1] ?? match[2] ?? match[3] : null;
}
for (const file of htmlFiles.sort()) {
  const owner = path.relative(repoRoot, file);
  const html = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  let index = 0;
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    index++;
    const type = (attribute(match[1], 'type') ?? '').trim().toLowerCase();
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type)) continue;
    const src = attribute(match[1], 'src');
    try {
      if (src !== null) {
        if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) continue;
        const resolved = new URL(src, 'https://repository.invalid/' + owner.replaceAll(path.sep, '/'));
        if (type !== 'module') classicFile(decodeURIComponent(resolved.pathname.slice(1)), owner);
      } else if (match[2].trim()) {
        const filename = `${owner}:inline-script-${index}`;
        if (type === 'module') execFileSync(process.execPath, ['--check', '--input-type=module'], { input: match[2], stdio: ['pipe', 'ignore', 'pipe'] });
        else new Script(match[2], { filename });
      }
    } catch (error) { problem(owner, error); }
  }
}
for (const file of files) {
  try {
    if (classic.has(file)) new Script(readFileSync(file, 'utf8'), { filename: path.relative(repoRoot, file) });
    else execFileSync(process.execPath, ['--check', file], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) { problem(path.relative(repoRoot, file), error); }
}
if (failed) {
  console.error(`\n${failed} problem${failed === 1 ? '' : 's'} in ${files.length} files`);
  process.exitCode = 1;
} else console.log(`✔ ${files.length} JavaScript files parse (${classic.size} classic entry points); manifest.json and package.json versions agree`);
