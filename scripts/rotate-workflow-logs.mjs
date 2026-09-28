#!/usr/bin/env node
/**
 * Size-control for the append-forever workflow logs (memory.md, prompts.md).
 *
 * Both logs are newest-first lists of `## ` version sections. When a log grows
 * past the threshold (~200 KB) this tool moves the OLDEST sections (from the
 * bottom) into docs/archive/<name> until the live log is back under the
 * threshold. The title/preamble above the first `## ` section and at least the
 * single newest section are always kept in place.
 *
 * Archive ordering: each rotation APPENDS its batch, so the archive reads
 * oldest-batch-first, with sections newest-first inside each batch (the same
 * relative order they had in the live log).
 *
 * It REFUSES to touch a log while an editor swap file for it is live, so it can
 * never corrupt a file you have open in vim/nvim mid-edit.
 *
 * Usage:
 *   node scripts/rotate-workflow-logs.mjs                 # rotate any over-threshold log
 *   node scripts/rotate-workflow-logs.mjs --dry-run       # report what would move, write nothing
 *   node scripts/rotate-workflow-logs.mjs --threshold=N   # override threshold in bytes
 *
 * npm alias: npm run logs:rotate
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const archiveDir = path.join(repoRoot, 'docs', 'archive');

const LOGS = ['memory.md', 'prompts.md'];
const DEFAULT_THRESHOLD = 200 * 1024; // ~200 KB

const dryRun = process.argv.includes('--dry-run');
const thresholdArg = process.argv.find((a) => a.startsWith('--threshold='));
const threshold = thresholdArg ? Number(thresholdArg.slice('--threshold='.length)) : DEFAULT_THRESHOLD;
// A NaN/negative threshold would silently make every comparison false and report
// "unsplittable" instead of rotating — reject it loudly instead.
if (!Number.isFinite(threshold) || threshold <= 0) {
  console.error(`Invalid --threshold: expected a positive number of bytes, got ${JSON.stringify(thresholdArg.slice('--threshold='.length))}`);
  process.exit(1);
}

const byteLen = (s) => Buffer.byteLength(s, 'utf8');

/** Returns the path of a live editor swap file for `file`, or null. */
function liveSwapFile(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  for (const name of readdirSync(dir)) {
    // vim/nvim: .<name>.swp/.swo/.swn ; generic editors: <name>.swp / <name>~
    if (
      (name.startsWith(`.${base}.sw`) || name === `${base}.swp` || name === `${base}~`) &&
      /(\.sw[a-p]|~)$/.test(name)
    ) {
      return path.join(dir, name);
    }
  }
  return null;
}

/** Split markdown into { preamble, sections } where sections start at `## `. */
function splitSections(text) {
  const lines = text.split('\n');
  const starts = [];
  lines.forEach((l, i) => {
    if (/^## /.test(l)) starts.push(i);
  });
  if (starts.length === 0) return { preamble: text, sections: [] };
  const preamble = lines.slice(0, starts[0]).join('\n');
  const sections = starts.map((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1] : lines.length;
    return lines.slice(start, end).join('\n');
  });
  return { preamble, sections };
}

function rotateOne(name) {
  const file = path.join(repoRoot, name);
  if (!existsSync(file)) return { name, status: 'absent' };

  const original = readFileSync(file, 'utf8');
  const size = byteLen(original);
  if (size <= threshold) return { name, status: 'under', size };

  const swap = liveSwapFile(file);
  if (swap) {
    return { name, status: 'refused', size, reason: `live editor swap file ${path.relative(repoRoot, swap)}` };
  }

  const { preamble, sections } = splitSections(original);
  if (sections.length <= 1) return { name, status: 'unsplittable', size };

  // Move oldest (tail) sections until the kept text is under threshold or only
  // the newest section remains.
  const kept = [...sections];
  const moved = [];
  const keptSize = () => byteLen([preamble, ...kept].join('\n'));
  while (keptSize() > threshold && kept.length > 1) {
    moved.unshift(kept.pop()); // preserve original (newest-first) order in `moved`
  }
  if (moved.length === 0) return { name, status: 'unsplittable', size };

  if (!dryRun) {
    mkdirSync(archiveDir, { recursive: true });
    const archiveFile = path.join(archiveDir, name);
    if (!existsSync(archiveFile)) {
      writeFileSync(archiveFile, `# Archived ${name} sections\n\nRotated out of \`${name}\` once it crossed ~${Math.round(threshold / 1024)} KB. Each rotation appends a batch: oldest batch first, newest section first within a batch.\n\n`, 'utf8');
    }
    appendFileSync(archiveFile, moved.join('\n') + '\n', 'utf8');
    const rebuilt = (preamble.trim() ? preamble.replace(/\s*$/, '') + '\n\n' : '') + kept.join('\n').replace(/^\n+/, '');
    writeFileSync(file, rebuilt.replace(/\n*$/, '\n'), 'utf8');
  }

  return { name, status: dryRun ? 'would-rotate' : 'rotated', size, movedCount: moved.length, keptCount: kept.length };
}

let exitCode = 0;
for (const name of LOGS) {
  let r;
  try {
    r = rotateOne(name);
  } catch (e) {
    // Keep one unreadable/unwritable log from aborting the rest of the run.
    console.error(`${name}: ERROR — ${(e && e.message) || e}`);
    exitCode = 1;
    continue;
  }
  switch (r.status) {
    case 'absent':
      console.log(`${name}: not present, skipping`);
      break;
    case 'under':
      console.log(`${name}: ${(r.size / 1024).toFixed(1)} KB, under ${(threshold / 1024).toFixed(0)} KB threshold — no rotation`);
      break;
    case 'unsplittable':
      console.warn(`${name}: ${(r.size / 1024).toFixed(1)} KB over threshold but cannot be split (needs >1 section)`);
      break;
    case 'refused':
      console.error(`${name}: REFUSED — ${r.reason}. Close the editor and re-run.`);
      exitCode = 1;
      break;
    case 'would-rotate':
      console.log(`${name}: would move ${r.movedCount} oldest section(s) to docs/archive/${name} (${r.keptCount} kept)`);
      break;
    case 'rotated':
      console.log(`${name}: moved ${r.movedCount} oldest section(s) to docs/archive/${name} (${r.keptCount} kept)`);
      break;
  }
}
process.exit(exitCode);
