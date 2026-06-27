#!/usr/bin/env node

/**
 * Supply chain security audit.
 *
 * 1. Verifies that every dependency and devDependency across all workspace
 *    package.json files uses an exact pinned version (no ^, ~, >=, etc.).
 *    - workspace:* and github: specifiers are exempt.
 *    - peerDependencies are exempt (ranges are expected).
 *    - pnpm.overrides ranges are logged as warnings (non-blocking).
 *
 * 2. Verifies that every non-workspace package in pnpm-lock.yaml has an
 *    integrity hash (sha512) in its resolution. Git-sourced packages resolved
 *    via tarball URL with a full commit SHA (40 hex chars) are accepted.
 *
 * Designed to run with only Node built-ins (no installed dependencies), so it
 * can execute before `pnpm install` in CI.
 *
 * @module scripts/audit-supply-chain
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const COMMIT_SHA_RE = /[0-9a-f]{40}/;

// ---------------------------------------------------------------------------
// Part 1 — package.json version pinning
// ---------------------------------------------------------------------------

function isVersionRange(version) {
  if (!version || typeof version !== 'string') return false;

  const exempt = ['workspace:', 'github:', 'git+', 'git://', 'http://', 'https://', 'file:', 'link:'];
  if (exempt.some((p) => version.startsWith(p))) return false;

  if (version === '*' || version === 'latest') return true;
  if (['^', '~', '>', '<', '='].some((c) => version.startsWith(c))) return true;
  if (version.includes('||') || version.includes(' - ') || version.includes('.x')) return true;
  if (/\s/.test(version)) return true;

  return false;
}

function getWorkspacePackagePaths() {
  const wsPath = join(ROOT, 'pnpm-workspace.yaml');
  if (!existsSync(wsPath)) return [];

  const content = readFileSync(wsPath, 'utf8');
  const globs = [];
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*-\s*["']?(.+?)["']?\s*$/);
    if (m) globs.push(m[1]);
  }

  const paths = [];
  for (const glob of globs) {
    if (!glob.endsWith('/*')) continue;
    const parent = join(ROOT, glob.slice(0, -2));
    if (!existsSync(parent)) continue;
    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = join(parent, entry.name, 'package.json');
      if (existsSync(p)) paths.push(p);
    }
  }
  return paths;
}

function auditPackageJsons() {
  const errors = [];
  const warnings = [];
  const pkgPaths = [join(ROOT, 'package.json'), ...getWorkspacePackagePaths()];

  for (const pkgPath of pkgPaths) {
    if (!existsSync(pkgPath)) continue;
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const rel = relative(ROOT, pkgPath);

    for (const section of ['dependencies', 'devDependencies']) {
      const deps = pkg[section];
      if (!deps) continue;
      for (const [name, version] of Object.entries(deps)) {
        if (isVersionRange(version)) {
          errors.push(`${rel} -> ${section}.${name}: "${version}" (must be an exact version)`);
        }
      }
    }

    const overrides = pkg.pnpm?.overrides;
    if (overrides) {
      for (const [name, version] of Object.entries(overrides)) {
        if (isVersionRange(version)) {
          warnings.push(`${rel} -> pnpm.overrides.${name}: "${version}" (range in override)`);
        }
      }
    }
  }

  return { errors, warnings };
}

// ---------------------------------------------------------------------------
// Part 2 — lockfile integrity verification
// ---------------------------------------------------------------------------

function auditLockfile() {
  const errors = [];
  const notes = [];
  const lockPath = join(ROOT, 'pnpm-lock.yaml');

  if (!existsSync(lockPath)) {
    errors.push('pnpm-lock.yaml not found');
    return { errors, notes };
  }

  const lines = readFileSync(lockPath, 'utf8').split('\n');
  let inPackages = false;
  let currentPkg = null;
  let resolved = false;
  let packagesFound = false;

  const flush = () => {
    if (currentPkg && !resolved) {
      errors.push(`${currentPkg}: missing integrity hash in resolution`);
    }
  };

  for (const line of lines) {
    if (/^[a-zA-Z]/.test(line) && line.endsWith(':')) {
      flush();
      currentPkg = null;
      inPackages = line === 'packages:';
      if (inPackages) packagesFound = true;
      continue;
    }

    if (!inPackages) continue;

    const pkgMatch = line.match(/^  (\S.+):$/);
    if (pkgMatch) {
      flush();
      currentPkg = pkgMatch[1];
      resolved = false;
      continue;
    }

    if (!currentPkg || !line.includes('resolution:')) continue;

    if (line.includes('integrity:')) {
      resolved = true;
    } else if (line.includes('tarball:')) {
      const urlMatch = line.match(/tarball:\s*(.+?)}/);
      if (urlMatch && COMMIT_SHA_RE.test(urlMatch[1])) {
        resolved = true;
        notes.push(`${currentPkg}: git tarball pinned to commit SHA`);
      } else {
        errors.push(
          `${currentPkg}: tarball URL without full commit SHA — ${urlMatch ? urlMatch[1].trim() : '(unparseable)'}`,
        );
      }
    } else if (line.includes('directory:')) {
      resolved = true;
    }
  }

  flush();

  if (!packagesFound) {
    errors.push('Could not locate "packages:" section in pnpm-lock.yaml');
  }

  return { errors, notes };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const DIVIDER = '='.repeat(50);

console.log(`\n${DIVIDER}`);
console.log('  Supply Chain Audit');
console.log(`${DIVIDER}\n`);

console.log('-- Package.json version pinning --\n');
const pkg = auditPackageJsons();

if (pkg.warnings.length) {
  console.log(`  Warnings (${pkg.warnings.length}):`);
  for (const w of pkg.warnings) console.log(`    [WARN] ${w}`);
  console.log();
}

if (pkg.errors.length) {
  console.log(`  Errors (${pkg.errors.length}):`);
  for (const e of pkg.errors) console.log(`    [FAIL] ${e}`);
} else {
  console.log('  All package.json versions are properly pinned.');
}

console.log('\n-- Lockfile integrity --\n');
const lock = auditLockfile();

if (lock.notes.length) {
  console.log(`  Notes (${lock.notes.length}):`);
  for (const n of lock.notes) console.log(`    [NOTE] ${n}`);
  console.log();
}

if (lock.errors.length) {
  console.log(`  Errors (${lock.errors.length}):`);
  for (const e of lock.errors) console.log(`    [FAIL] ${e}`);
} else {
  console.log('  All lockfile entries have integrity verification.');
}

console.log(`\n${DIVIDER}\n`);

const total = pkg.errors.length + lock.errors.length;
if (total) {
  console.log(`FAILED: ${total} supply chain issue(s) found.\n`);
  process.exit(1);
} else {
  console.log('PASSED: No supply chain issues detected.\n');
}
