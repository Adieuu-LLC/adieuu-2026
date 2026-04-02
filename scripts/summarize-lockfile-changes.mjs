#!/usr/bin/env node

/**
 * Generates a human-readable summary of lockfile dependency changes between
 * a base and head version of pnpm-lock.yaml.
 *
 * Designed for CI: outputs Markdown suitable for a PR comment. Exits silently
 * (no output, exit 0) when there are no dependency-level changes, so the
 * calling workflow can skip commenting.
 *
 * Usage:
 *   node scripts/summarize-lockfile-changes.mjs \
 *     --base /tmp/base-lockfile.yaml \
 *     --head pnpm-lock.yaml
 *
 * Uses only Node built-ins — no installed dependencies required.
 *
 * @module scripts/summarize-lockfile-changes
 */

import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  args: process.argv.slice(2),
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: 'pnpm-lock.yaml' },
  },
});

if (!args.base) {
  console.error('Usage: node summarize-lockfile-changes.mjs --base <path> [--head <path>]');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Lockfile parser — extracts the packages: section into a Map
// ---------------------------------------------------------------------------

function parseLockfilePackages(content) {
  const packages = new Map();
  if (!content) return packages;

  const lines = content.split('\n');
  let inPackages = false;
  let currentKey = null;
  let currentData = {};

  const flush = () => {
    if (currentKey) packages.set(currentKey, { ...currentData });
  };

  for (const line of lines) {
    if (/^[a-zA-Z]/.test(line) && line.endsWith(':')) {
      flush();
      currentKey = null;
      currentData = {};
      inPackages = line === 'packages:';
      continue;
    }

    if (!inPackages) continue;

    const pkgMatch = line.match(/^  (\S.+):$/);
    if (pkgMatch) {
      flush();
      currentKey = pkgMatch[1];
      currentData = {};
      continue;
    }

    if (!currentKey) continue;

    if (line.includes('resolution:')) {
      const integrityMatch = line.match(/integrity:\s*(\S+?)}/);
      const tarballMatch = line.match(/tarball:\s*(\S+?)}/);
      if (integrityMatch) currentData.integrity = integrityMatch[1];
      if (tarballMatch) currentData.tarball = tarballMatch[1];
    }

    const versionMatch = line.match(/^\s+version:\s*['"]?(\S+?)['"]?\s*$/);
    if (versionMatch) currentData.version = versionMatch[1];
  }

  flush();
  return packages;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function extractName(key) {
  const urlMatch = key.match(/^(.+?)@(https?:\/\/.+)$/);
  if (urlMatch) return urlMatch[1];

  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) return key;
  return key.substring(0, lastAt);
}

function extractVersion(key, data) {
  if (data?.version) return data.version;

  const urlMatch = key.match(/^(.+?)@(https?:\/\/.+)$/);
  if (urlMatch) return null;

  const lastAt = key.lastIndexOf('@');
  if (lastAt <= 0) return null;
  return key.substring(lastAt + 1);
}

function truncateHash(hash) {
  if (!hash) return '';
  if (hash.length <= 24) return hash;
  return hash.substring(0, 20) + '...';
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

function diffPackages(baseMap, headMap) {
  const added = new Map();
  const removed = new Map();
  const integrityChanged = [];

  for (const [key, data] of headMap) {
    if (!baseMap.has(key)) {
      added.set(key, data);
    } else {
      const baseData = baseMap.get(key);
      const baseHash = baseData.integrity || baseData.tarball || '';
      const headHash = data.integrity || data.tarball || '';
      if (baseHash !== headHash && (baseHash || headHash)) {
        integrityChanged.push({
          key,
          name: extractName(key),
          version: extractVersion(key, data),
          oldHash: baseHash,
          newHash: headHash,
        });
      }
    }
  }

  for (const [key, data] of baseMap) {
    if (!headMap.has(key)) {
      removed.set(key, data);
    }
  }

  const addedByName = new Map();
  for (const [key, data] of added) {
    const name = extractName(key);
    if (!addedByName.has(name)) addedByName.set(name, []);
    addedByName.get(name).push({ key, ...data });
  }

  const removedByName = new Map();
  for (const [key, data] of removed) {
    const name = extractName(key);
    if (!removedByName.has(name)) removedByName.set(name, []);
    removedByName.get(name).push({ key, ...data });
  }

  const upgrades = [];
  const pureAdded = [];
  const pureRemoved = [];

  for (const [name, entries] of addedByName) {
    const removedEntries = removedByName.get(name);
    if (removedEntries) {
      upgrades.push({
        name,
        oldVersions: removedEntries.map((e) => extractVersion(e.key, e)),
        newVersions: entries.map((e) => extractVersion(e.key, e)),
      });
      removedByName.delete(name);
    } else {
      for (const e of entries) {
        pureAdded.push({ name, version: extractVersion(e.key, e) });
      }
    }
  }

  for (const [, entries] of removedByName) {
    for (const e of entries) {
      const name = extractName(e.key);
      pureRemoved.push({ name, version: extractVersion(e.key, e) });
    }
  }

  return { pureAdded, pureRemoved, upgrades, integrityChanged };
}

// ---------------------------------------------------------------------------
// Markdown output
// ---------------------------------------------------------------------------

function formatSummary(diff) {
  const { pureAdded, pureRemoved, upgrades, integrityChanged } = diff;
  const totalChanges = pureAdded.length + pureRemoved.length + upgrades.length + integrityChanged.length;

  if (totalChanges === 0) return '';

  const lines = [];
  lines.push('<!-- supply-chain-lockfile-summary -->');
  lines.push('## Supply Chain: Lockfile Changes\n');

  if (integrityChanged.length > 0) {
    lines.push(
      `### Integrity Changes (${integrityChanged.length}) -- INVESTIGATE\n`,
    );
    lines.push(
      '> Same version, different content hash. This may indicate a republished or compromised package.\n',
    );
    lines.push('| Package | Version | Old Hash | New Hash |');
    lines.push('|---------|---------|----------|----------|');
    for (const c of integrityChanged) {
      lines.push(`| \`${c.name}\` | ${c.version || '?'} | \`${truncateHash(c.oldHash)}\` | \`${truncateHash(c.newHash)}\` |`);
    }
    lines.push('');
  }

  if (pureAdded.length > 0) {
    lines.push(`### New Dependencies (${pureAdded.length})\n`);
    lines.push('| Package | Version |');
    lines.push('|---------|---------|');
    for (const a of pureAdded) {
      lines.push(`| \`${a.name}\` | ${a.version || '?'} |`);
    }
    lines.push('');
  }

  if (pureRemoved.length > 0) {
    lines.push(`### Removed Dependencies (${pureRemoved.length})\n`);
    lines.push('| Package | Version |');
    lines.push('|---------|---------|');
    for (const r of pureRemoved) {
      lines.push(`| \`${r.name}\` | ${r.version || '?'} |`);
    }
    lines.push('');
  }

  if (upgrades.length > 0) {
    lines.push(`### Version Changes (${upgrades.length})\n`);
    lines.push('| Package | Old | New |');
    lines.push('|---------|-----|-----|');
    for (const u of upgrades) {
      const old = u.oldVersions.filter(Boolean).join(', ') || '?';
      const nw = u.newVersions.filter(Boolean).join(', ') || '?';
      lines.push(`| \`${u.name}\` | ${old} | ${nw} |`);
    }
    lines.push('');
  }

  lines.push(`---\n*${totalChanges} lockfile change(s) detected. Please review for supply chain implications.*`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const baseContent = existsSync(args.base) ? readFileSync(args.base, 'utf8') : '';
const headContent = existsSync(args.head) ? readFileSync(args.head, 'utf8') : '';

const baseMap = parseLockfilePackages(baseContent);
const headMap = parseLockfilePackages(headContent);
const diff = diffPackages(baseMap, headMap);
const summary = formatSummary(diff);

if (summary) {
  process.stdout.write(summary + '\n');
}
