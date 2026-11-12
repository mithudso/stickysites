#!/usr/bin/env node
/** Validate index paths and required llms/wiki links; --prune removes missing index entries. */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const indexPath = path.join(repoRoot, 'docs/high_signal_file_index.json');
const prune = process.argv.includes('--prune');
let exitCode = 0;

function safeTarget(target, base = repoRoot) {
  const decoded = decodeURIComponent(target.split('#')[0].split('?')[0]);
  if (!decoded || path.isAbsolute(decoded) || /[\\\x00-\x1f]/.test(decoded)) throw new Error(`unsafe relative path: ${target}`);
  const full = path.resolve(base, decoded);
  const inside = (file) => file === repoRoot || file.startsWith(repoRoot + path.sep);
  if (!inside(full) || (existsSync(full) && !inside(realpathSync(full)))) throw new Error(`path escapes repository: ${target}`);
  return full;
}
function onDisk(target, base) { return existsSync(safeTarget(target, base)); }

// Handle the link forms used by maintained indexes without treating examples as
// actual destinations. Definitions are resolved case-insensitively as Markdown is.
function markdownTargets(markdown) {
  let fence = null;
  const visible = markdown.replace(/<!--[\s\S]*?-->/g, '').split('\n').map((line) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return '';
    }
    if (marker) { fence = { char: marker[1][0], length: marker[1].length }; return ''; }
    return /^ {4}|^\t/.test(line) ? '' : line;
  }).join('\n').replace(/(`+)[\s\S]*?\1/g, '');
  const normalize = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();
  const definitions = new Map();
  const prose = visible.replace(/^ {0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]+)>|([^\s]+)).*$/gm, (_, label, angled, plain) => {
    const key = normalize(label);
    if (!definitions.has(key)) definitions.set(key, angled ?? plain);
    return '';
  });
  const targets = new Set();
  for (const match of prose.matchAll(/\]\(\s*(?:<([^>\n]+)>|([^\s)]+))/g)) targets.add(match[1] ?? match[2]);
  for (const match of prose.matchAll(/\[([^\]\n]+)\](?:\[([^\]\n]*)\])?/g)) {
    if (prose[match.index + match[0].length] === '(') continue;
    const destination = definitions.get(normalize(match[2] || match[1]));
    if (destination) targets.add(destination);
  }
  return targets;
}

try {
  safeTarget('docs/high_signal_file_index.json');
  if (!existsSync(indexPath)) throw new Error('Missing docs/high_signal_file_index.json — the retrieval index does not exist.');
  const entries = JSON.parse(readFileSync(indexPath, 'utf8'));
  if (!Array.isArray(entries)) throw new Error('docs/high_signal_file_index.json must be a JSON array of index entries.');
  const deadPaths = [];
  for (const entry of entries) {
    if (!entry || typeof entry.path !== 'string') throw new Error('Index entry missing a string "path".');
    if (!onDisk(entry.path)) deadPaths.push(entry.path);
    if (entry.depends_on != null && !Array.isArray(entry.depends_on)) throw new Error(`Index entry "${entry.path}" has a non-array "depends_on".`);
    for (const dep of entry.depends_on ?? []) {
      if (typeof dep !== 'string' || dep.startsWith('@') || !dep.includes('/')) continue;
      if (!onDisk(dep)) console.warn(`warning: depends_on target not found on disk: ${entry.path} → ${dep}`);
    }
  }
  if (deadPaths.length && prune) {
    const kept = entries.filter((entry) => !deadPaths.includes(entry.path));
    writeFileSync(indexPath, JSON.stringify(kept, null, 2) + '\n');
    console.log(`Pruned ${deadPaths.length} dead entries (${kept.length} remain).`);
  } else if (deadPaths.length) {
    console.error(`docs/high_signal_file_index.json has missing files:\n  ${deadPaths.join('\n  ')}`);
    exitCode = 1;
  } else console.log(`docs/high_signal_file_index.json is current (${entries.length} entries, all paths valid)`);
} catch (error) {
  console.error(error.message);
  exitCode = 1;
}

for (const name of ['llms.txt', 'docs/wiki/index.md']) {
  try {
    const file = safeTarget(name);
    if (!existsSync(file)) throw new Error(`Missing ${name} — the required documentation index does not exist.`);
    let seen = 0;
    const missing = [];
    for (const target of markdownTargets(readFileSync(file, 'utf8'))) {
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) continue;
      seen++;
      if (!onDisk(target, path.dirname(file))) missing.push(target);
    }
    if (missing.length) throw new Error(`${name} has dead relative links:\n  ${missing.join('\n  ')}`);
    console.log(`${name} is current (${seen} relative links, all resolve)`);
  } catch (error) {
    console.error(`${name}: ${error.message}`);
    exitCode = 1;
  }
}
process.exitCode = exitCode;
