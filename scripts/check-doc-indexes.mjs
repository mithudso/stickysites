#!/usr/bin/env node
/**
 * Path-validates the LLM retrieval indexes so they can never rot silently:
 *
 *   docs/high_signal_file_index.json  — every entry's `path` must exist on disk
 *   llms.txt                          — every relative markdown link must exist on disk
 *
 * Dead entries make retrieval worse than no index, so CI runs this after tests.
 *
 * Usage:
 *   node scripts/check-doc-indexes.mjs           # report; non-zero exit if any path is dead
 *   node scripts/check-doc-indexes.mjs --prune   # drop dead index entries and rewrite the JSON
 *
 * npm alias: npm run docs:check-indexes
 *
 * `depends_on` targets are validated too, but a missing dependency is only a warning
 * (it may name a conceptual rather than on-disk dependency).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoRoot, 'docs', 'high_signal_file_index.json');
const llmsPath = path.join(repoRoot, 'llms.txt');
const prune = process.argv.includes('--prune');

const rel = (p) => path.relative(repoRoot, p);
const onDisk = (p) => existsSync(path.join(repoRoot, p));

let exitCode = 0;

// ── docs/high_signal_file_index.json ─────────────────────────────────────────
let raw;
try {
  raw = readFileSync(indexPath, 'utf8');
} catch {
  console.error(`Missing ${rel(indexPath)} — the retrieval index does not exist.`);
  process.exit(1);
}

let entries;
try {
  entries = JSON.parse(raw);
} catch (err) {
  console.error(`${rel(indexPath)} is not valid JSON: ${err.message}`);
  process.exit(1);
}
if (!Array.isArray(entries)) {
  console.error(`${rel(indexPath)} must be a JSON array of index entries.`);
  process.exit(1);
}

const deadPaths = [];
const missingDeps = [];
for (const entry of entries) {
  if (!entry || typeof entry.path !== 'string') {
    console.error(`Index entry missing a string "path": ${JSON.stringify(entry)}`);
    process.exit(1);
  }
  if (!onDisk(entry.path)) deadPaths.push(entry.path);
  if (entry.depends_on != null && !Array.isArray(entry.depends_on)) {
    console.error(`Index entry "${entry.path}" has a non-array "depends_on".`);
    process.exit(1);
  }
  for (const dep of entry.depends_on ?? []) {
    if (typeof dep !== 'string' || dep.startsWith('@') || !dep.includes('/')) continue;
    if (!onDisk(dep)) missingDeps.push(`${entry.path} → ${dep}`);
  }
}
for (const dep of missingDeps) console.warn(`warning: depends_on target not found on disk: ${dep}`);

if (deadPaths.length === 0) {
  console.log(`${rel(indexPath)} is current (${entries.length} entries, all paths valid)`);
} else if (prune) {
  const kept = entries.filter((e) => onDisk(e.path));
  writeFileSync(indexPath, JSON.stringify(kept, null, 2) + '\n', 'utf8');
  console.log(`Pruned ${deadPaths.length} dead entr${deadPaths.length === 1 ? 'y' : 'ies'} (${kept.length} remain):`);
  for (const p of deadPaths) console.log(`  - ${p}`);
} else {
  console.error(`${rel(indexPath)} is stale — ${deadPaths.length} entr${deadPaths.length === 1 ? 'y points' : 'ies point'} at missing files:`);
  for (const p of deadPaths) console.error(`  - ${p}`);
  console.error('Fix the paths or run: npm run docs:check-indexes -- --prune');
  exitCode = 1;
}

// ── llms.txt relative links ──────────────────────────────────────────────────
if (existsSync(llmsPath)) {
  const text = readFileSync(llmsPath, 'utf8');
  const deadLinks = [];
  let seen = 0;
  for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    const target = m[1];
    if (/^[a-z]+:/i.test(target) || target.startsWith('#')) continue; // URLs / anchors
    seen++;
    if (!onDisk(target.split('#')[0])) deadLinks.push(target);
  }
  if (deadLinks.length === 0) {
    console.log(`llms.txt is current (${seen} relative links, all resolve)`);
  } else {
    console.error(`llms.txt has ${deadLinks.length} dead relative link${deadLinks.length === 1 ? '' : 's'}:`);
    for (const l of deadLinks) console.error(`  - ${l}`);
    exitCode = 1;
  }
}

process.exit(exitCode);
