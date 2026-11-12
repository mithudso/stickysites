#!/usr/bin/env node
/**
 * Rotate whole oldest Markdown sections, preserving the preamble and newest section.
 * Cooperating rotators use an exclusive lock in private Git state. A journal makes
 * the two atomic file replacements recoverable. Changed snapshots and editor swap
 * files cause refusal. Arbitrary editors do not honor this lock; an editor can still
 * race the final comparison/rename. Close editors before rotating important logs.
 * A crash leaves its lock: --recover removes it only when its local owner is dead.
 * A separate acquisition.guard serializes lock replacement; a stale guard requires
 * manual ownership review and is never removed automatically.
 */
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_THRESHOLD = 200 * 1024;
const LOGS = ['memory.md', 'prompts.md'];
const byteLen = (text) => Buffer.byteLength(text, 'utf8');

export function splitSections(text) {
  const starts = [];
  let offset = 0;
  let fence = null;
  for (const line of text.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!line) continue;
    const marker = line.replace(/\r?\n$/, '').match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
    } else if (marker) {
      fence = { char: marker[1][0], length: marker[1].length };
    } else if (line.startsWith('## ')) starts.push(offset);
    offset += line.length;
  }
  if (!starts.length) return { preamble: text, sections: [] };
  return { preamble: text.slice(0, starts[0]), sections: starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length)) };
}

function regularText(file, absent = null) {
  try {
    if (!lstatSync(file).isFile()) throw new Error(`Refusing non-regular file: ${file}`);
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return absent;
    throw error;
  }
}
function atomicWrite(file, text, mode = 0o600) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.${randomUUID()}.tmp`);
  let fd;
  try {
    fd = openSync(temp, 'wx', mode);
    writeFileSync(fd, text, 'utf8');
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temp, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    rmSync(temp, { force: true });
  }
}
function stateDirectory(root) {
  const dotGit = path.join(root, '.git');
  const stat = lstatSync(dotGit);
  let gitDir = dotGit;
  if (stat.isFile()) {
    const match = readFileSync(dotGit, 'utf8').trim().match(/^gitdir: (.+)$/);
    if (!match) throw new Error('Cannot locate private Git state directory.');
    gitDir = path.resolve(root, match[1]);
  } else if (!stat.isDirectory()) throw new Error('Refusing symlinked Git state directory.');
  const state = path.join(gitDir, 'stickysites-workflow-rotation');
  if (existsSync(state) && !lstatSync(state).isDirectory()) throw new Error('Refusing non-directory rotation state.');
  mkdirSync(state, { recursive: true, mode: 0o700 });
  return state;
}
function liveSwapFile(file) {
  const base = path.basename(file);
  return readdirSync(path.dirname(file)).find((name) =>
    (name.startsWith(`.${base}.sw`) || name === `${base}.swp` || name === `${base}~`) && /(\.sw[a-p]|~)$/.test(name));
}
function withLockGuard(state, action) {
  const guard = path.join(state, 'acquisition.guard');
  const raw = JSON.stringify({ pid: process.pid, host: os.hostname(), token: randomUUID() }) + '\n';
  let fd;
  try {
    fd = openSync(guard, 'wx', 0o600);
    writeFileSync(fd, raw);
    fsyncSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Lock acquisition.guard is owned by another contender or needs manual review; preserving it.');
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
  function releaseGuard() {
    if (regularText(guard) !== raw) throw new Error('Acquisition guard ownership changed; preserving it.');
    rmSync(guard);
  }
  try { return action(); }
  finally { releaseGuard(); }
}
function acquireLock(state, recover) {
  return withLockGuard(state, () => acquireLockInsideGuard(state, recover));
}
function acquireLockInsideGuard(state, recover) {
  const file = path.join(state, 'rotation.lock');
  if (existsSync(file) && recover) {
    const raw = regularText(file);
    const owner = JSON.parse(raw);
    if (owner.host !== os.hostname() || !Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw new Error('Lock ownership is uncertain; preserve rotation.lock for manual review.');
    try {
      process.kill(owner.pid, 0);
      throw new Error(`Rotation lock owner ${owner.pid} is still active.`);
    } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
    if (regularText(file) !== raw) throw new Error('Lock changed during recovery; refusing.');
    rmSync(file);
    console.warn('Recovered the rotation lock of a dead local process.');
  }
  const token = randomUUID();
  let fd;
  try {
    fd = openSync(file, 'wx', 0o600);
    writeFileSync(fd, JSON.stringify({ pid: process.pid, host: os.hostname(), token }) + '\n');
    fsyncSync(fd);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another rotator owns rotation.lock. If its local owner crashed, inspect state and use --recover.');
    throw error;
  } finally { if (fd !== undefined) closeSync(fd); }
  return () => withLockGuard(state, () => {
    const owner = JSON.parse(regularText(file));
    if (owner.token !== token) throw new Error('Rotation lock ownership changed; preserving lock.');
    rmSync(file);
  });
}
function finishTransaction(root, journalFile, transaction, hooks = {}) {
  if (!LOGS.includes(transaction.name) || transaction.format !== 1) throw new Error('Unknown rotation journal; preserving it for manual review.');
  for (const key of ['liveBefore', 'liveAfter', 'archiveAfter']) {
    if (typeof transaction[key] !== 'string') throw new Error(`Invalid rotation journal field ${key}; preserving it.`);
  }
  if (transaction.archiveBefore !== null && typeof transaction.archiveBefore !== 'string') throw new Error('Invalid archive snapshot in rotation journal.');
  const file = path.join(root, transaction.name);
  const archive = path.join(root, 'docs/archive', transaction.name);
  for (const directory of [path.join(root, 'docs'), path.join(root, 'docs/archive')]) {
    try { if (!lstatSync(directory).isDirectory()) throw new Error(`Refusing non-directory archive parent: ${directory}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const live = regularText(file);
  const archived = regularText(archive);
  if (![transaction.liveBefore, transaction.liveAfter].includes(live) || ![transaction.archiveBefore, transaction.archiveAfter].includes(archived)) {
    throw new Error(`${transaction.name}: file changed since rotation snapshot; journal retained. Review live/archive files before recovery.`);
  }
  if (liveSwapFile(file)) throw new Error(`${transaction.name}: editor swap file present; journal retained.`);
  if (archived !== transaction.archiveAfter) atomicWrite(archive, transaction.archiveAfter, transaction.archiveMode);
  hooks.afterArchive?.(transaction);
  if (regularText(file) !== live) throw new Error(`${transaction.name}: live file changed before commit; journal retained.`);
  if (live !== transaction.liveAfter) atomicWrite(file, transaction.liveAfter, transaction.liveMode);
  hooks.afterLive?.(transaction);
  rmSync(journalFile);
}

export function rotateLogs({ repoRoot, threshold = DEFAULT_THRESHOLD, dryRun = false, recover = false, hooks = {} }) {
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('Invalid --threshold: expected a positive number of bytes.');
  let state, release;
  if (!dryRun) {
    state = stateDirectory(repoRoot);
    release = acquireLock(state, recover);
  }
  const results = [];
  try {
    for (const name of LOGS) {
      const journal = state && path.join(state, `${name}.journal.json`);
      if (journal && existsSync(journal)) finishTransaction(repoRoot, journal, JSON.parse(regularText(journal)), hooks);
      const file = path.join(repoRoot, name);
      const original = regularText(file);
      if (original === null) { results.push(`${name}: not present, skipping`); continue; }
      if (byteLen(original) <= threshold) { results.push(`${name}: under threshold — no rotation`); continue; }
      if (liveSwapFile(file)) throw new Error(`${name}: REFUSED — editor swap file present.`);
      const { preamble, sections } = splitSections(original);
      const kept = [...sections];
      const moved = [];
      while (byteLen(preamble + kept.join('')) > threshold && kept.length > 1) moved.unshift(kept.pop());
      if (!moved.length) { results.push(`${name}: over threshold but cannot split the newest section`); continue; }
      if (!dryRun) {
        const archiveFile = path.join(repoRoot, 'docs/archive', name);
        const archiveBefore = regularText(archiveFile);
        const header = `# Archived ${name} sections\n\nOldest rotation batch first; original section order within each batch.\n\n`;
        const transaction = {
          format: 1, name, liveBefore: original, liveAfter: preamble + kept.join(''), archiveBefore,
          archiveAfter: (archiveBefore ?? header) + (archiveBefore && !archiveBefore.endsWith('\n') ? '\n' : '') + moved.join(''),
          liveMode: lstatSync(file).mode & 0o777,
          archiveMode: archiveBefore === null ? 0o600 : lstatSync(archiveFile).mode & 0o777,
        };
        atomicWrite(journal, JSON.stringify(transaction) + '\n');
        hooks.afterPrepare?.(transaction);
        finishTransaction(repoRoot, journal, transaction, hooks);
      }
      results.push(`${name}: ${dryRun ? 'would move' : 'moved'} ${moved.length} oldest section(s) to docs/archive/${name} (${kept.length} kept)`);
    }
    return results;
  } finally { release?.(); }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const thresholdArg = process.argv.find((arg) => arg.startsWith('--threshold='));
    const results = rotateLogs({
      repoRoot: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
      threshold: thresholdArg ? Number(thresholdArg.slice('--threshold='.length)) : DEFAULT_THRESHOLD,
      dryRun: process.argv.includes('--dry-run'), recover: process.argv.includes('--recover'),
    });
    for (const result of results) console.log(result);
  } catch (error) {
    console.error(`Workflow rotation: ${error.message}`);
    process.exitCode = 1;
  }
}
