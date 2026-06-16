/**
 * Passphrase-change local re-wrap orchestrator
 *
 * When a user changes their alias passphrase, the server-side identity record
 * and key bundle are re-encrypted with a key derived from the new passphrase.
 * However, all locally-stored cryptographic material (device keys, signed and
 * one-time pre-keys, persisted session keys, and community cipher entropy) is
 * encrypted at rest with a *wrapping key* derived from the passphrase. The
 * per-identity wrapping salt does NOT change, so a new passphrase yields a new
 * wrapping key and the old local material becomes undecryptable.
 *
 * This module re-wraps all five categories of local material from the old
 * wrapping key to the new one so historical messages remain readable. The
 * underlying message encryption keys are never touched — only the at-rest
 * wrapping changes.
 *
 * Two modes:
 *   1. Direct: the caller already holds the active in-memory wrapping key for a
 *      known identity (alias session). Deterministic, no discovery needed.
 *   2. Discovery: no active identity (account-mode passphrase change). The
 *      correct local identity is found by probing each local identity's stored
 *      material with a wrapping key derived from the supplied current
 *      passphrase. If more than one local identity matches (e.g. two separate
 *      accounts that happen to share the same passphrase string on a shared
 *      device), the migration aborts safely rather than risk corrupting the
 *      wrong identity's keys.
 *
 * All re-wrap operations are idempotent so the orchestrator can be retried
 * safely after a partial failure.
 *
 * @module services/passphraseLocalMigration
 */

import { deriveEntropyWrappingKey, clearBytes } from '@adieuu/crypto';
import {
  getOrCreateWrappingSalt,
  getAllDeviceKeyIdentityIds,
  deviceKeysDecryptWith,
  reWrapDeviceKeys,
} from './deviceKeyStorage';
import {
  getAllPreKeyIdentityIds,
  preKeysDecryptWith,
  reWrapSignedPreKeys,
  reWrapOneTimePreKeys,
  reWrapSessionKeys,
} from './preKeyStorage';
import {
  getAllCipherIdentityIds,
  cipherEntropyDecryptsWith,
  reWrapAllCiphers,
} from './cipherStoreOperations';

export interface PassphraseMigrationCounts {
  deviceKeys: number;
  signedPreKeys: number;
  oneTimePreKeys: number;
  sessionKeys: number;
  ciphers: number;
}

export type PassphraseMigrationStatus =
  /** Local material for exactly one identity was re-wrapped successfully. */
  | 'migrated'
  /** No passphrase-protected local material exists on this device. */
  | 'no-local-data'
  /** Local material exists but the current passphrase unlocked none of it. */
  | 'no-match'
  /** Multiple local identities matched the current passphrase; aborted. */
  | 'ambiguous';

export interface PassphraseMigrationResult {
  status: PassphraseMigrationStatus;
  /** The identity whose local material was re-wrapped (when status='migrated'). */
  identityId?: string;
  /**
   * New wrapping key derived from the new passphrase. Only present when
   * status='migrated'. The caller owns this buffer: adopt it into the active
   * in-memory wrapping key, or clear it with clearBytes when not needed.
   */
  newWrappingKey?: Uint8Array;
  counts?: PassphraseMigrationCounts;
  /** Number of local candidate identities considered (discovery mode). */
  candidateCount?: number;
}

export interface ReWrapPassphraseProtectedStoresParams {
  /** The new passphrase the user is switching to. */
  newPassphrase: string;
  /**
   * Direct mode: the identity whose material should be re-wrapped together with
   * its current in-memory wrapping key. When both are provided, discovery is
   * skipped.
   */
  identityId?: string;
  oldWrappingKey?: Uint8Array;
  /**
   * Discovery mode: the current passphrase, used to probe local stores and find
   * the matching identity. Required when identityId/oldWrappingKey are absent.
   */
  currentPassphrase?: string;
  /**
   * Targeted mode: a known identity to re-wrap using `currentPassphrase`,
   * probing ONLY that identity (no cross-identity discovery). Used by the
   * remote-change migration prompt where the identity being unlocked is known.
   */
  targetIdentityId?: string;
}

/**
 * Re-wraps every category of passphrase-protected local material for a single
 * identity from the old wrapping key to the new one.
 */
async function reWrapAllForIdentity(
  identityId: string,
  oldWrappingKey: Uint8Array,
  newWrappingKey: Uint8Array,
  wrappingSalt: Uint8Array,
): Promise<PassphraseMigrationCounts> {
  const deviceKeys = await reWrapDeviceKeys(identityId, oldWrappingKey, newWrappingKey);
  const signedPreKeys = await reWrapSignedPreKeys(identityId, oldWrappingKey, newWrappingKey);
  const oneTimePreKeys = await reWrapOneTimePreKeys(identityId, oldWrappingKey, newWrappingKey);
  const sessionKeys = await reWrapSessionKeys(identityId, oldWrappingKey, newWrappingKey);
  const ciphers = await reWrapAllCiphers(identityId, oldWrappingKey, newWrappingKey, wrappingSalt);

  return { deviceKeys, signedPreKeys, oneTimePreKeys, sessionKeys, ciphers };
}

/**
 * Collects the union of identity IDs that have any passphrase-protected local
 * material (device keys, pre-keys, or ciphers).
 */
async function collectCandidateIdentityIds(hint?: string): Promise<string[]> {
  const [deviceIds, preKeyIds, cipherIds] = await Promise.all([
    getAllDeviceKeyIdentityIds().catch(() => [] as string[]),
    getAllPreKeyIdentityIds().catch(() => [] as string[]),
    getAllCipherIdentityIds().catch(() => [] as string[]),
  ]);

  const ids = new Set<string>([...deviceIds, ...preKeyIds, ...cipherIds]);
  if (hint) ids.add(hint);
  return [...ids];
}

/**
 * Probes whether the given wrapping key can decrypt any of the identity's
 * locally-stored material. A positive match in any category proves ownership.
 */
async function probeIdentity(identityId: string, wrappingKey: Uint8Array): Promise<boolean> {
  if ((await deviceKeysDecryptWith(identityId, wrappingKey)) === true) return true;
  if ((await preKeysDecryptWith(identityId, wrappingKey)) === true) return true;
  if ((await cipherEntropyDecryptsWith(identityId, wrappingKey)) === true) return true;
  return false;
}

/**
 * Re-wraps all passphrase-protected local material so message history remains
 * decryptable after a passphrase change. See module docs for behaviour.
 */
export async function reWrapPassphraseProtectedStores(
  params: ReWrapPassphraseProtectedStoresParams,
): Promise<PassphraseMigrationResult> {
  const { newPassphrase, identityId, oldWrappingKey, currentPassphrase, targetIdentityId } = params;

  // ---- Direct mode -------------------------------------------------------
  if (identityId && oldWrappingKey) {
    const wrappingSalt = await getOrCreateWrappingSalt(identityId);
    const newWrappingKey = await deriveEntropyWrappingKey(newPassphrase, wrappingSalt);
    const counts = await reWrapAllForIdentity(identityId, oldWrappingKey, newWrappingKey, wrappingSalt);
    return { status: 'migrated', identityId, newWrappingKey, counts, candidateCount: 1 };
  }

  // ---- Targeted mode (known identity, old passphrase) --------------------
  // Used by the remote-change migration prompt: we know exactly which identity
  // is being unlocked, so probe ONLY that identity rather than every local one.
  // This avoids cross-identity ambiguity if another local identity happens to
  // share the same old passphrase string.
  if (targetIdentityId && currentPassphrase) {
    const wrappingSalt = await getOrCreateWrappingSalt(targetIdentityId);
    const probeKey = await deriveEntropyWrappingKey(currentPassphrase, wrappingSalt);
    let matched = false;
    try {
      matched = await probeIdentity(targetIdentityId, probeKey);
    } catch {
      matched = false;
    }
    if (!matched) {
      clearBytes(probeKey);
      return { status: 'no-match', candidateCount: 1 };
    }
    try {
      const newWrappingKey = await deriveEntropyWrappingKey(newPassphrase, wrappingSalt);
      const counts = await reWrapAllForIdentity(targetIdentityId, probeKey, newWrappingKey, wrappingSalt);
      return { status: 'migrated', identityId: targetIdentityId, newWrappingKey, counts, candidateCount: 1 };
    } finally {
      clearBytes(probeKey);
    }
  }

  // ---- Discovery mode ----------------------------------------------------
  if (!currentPassphrase) {
    throw new Error(
      'reWrapPassphraseProtectedStores requires either (identityId + oldWrappingKey) or currentPassphrase',
    );
  }

  const candidates = await collectCandidateIdentityIds(identityId);
  if (candidates.length === 0) {
    return { status: 'no-local-data', candidateCount: 0 };
  }

  const matches: Array<{ identityId: string; oldWrappingKey: Uint8Array; wrappingSalt: Uint8Array }> = [];

  for (const candidate of candidates) {
    const wrappingSalt = await getOrCreateWrappingSalt(candidate);
    const probeKey = await deriveEntropyWrappingKey(currentPassphrase, wrappingSalt);
    let matched = false;
    try {
      matched = await probeIdentity(candidate, probeKey);
    } catch {
      matched = false;
    }
    if (matched) {
      matches.push({ identityId: candidate, oldWrappingKey: probeKey, wrappingSalt });
    } else {
      clearBytes(probeKey);
    }
  }

  if (matches.length === 0) {
    return { status: 'no-match', candidateCount: candidates.length };
  }

  if (matches.length > 1) {
    // Two or more local identities share this passphrase string. We cannot
    // safely tell which one the change applies to, so abort without modifying
    // any stored material.
    for (const m of matches) clearBytes(m.oldWrappingKey);
    return { status: 'ambiguous', candidateCount: candidates.length };
  }

  const match = matches[0]!;
  try {
    const newWrappingKey = await deriveEntropyWrappingKey(newPassphrase, match.wrappingSalt);
    const counts = await reWrapAllForIdentity(
      match.identityId,
      match.oldWrappingKey,
      newWrappingKey,
      match.wrappingSalt,
    );
    return {
      status: 'migrated',
      identityId: match.identityId,
      newWrappingKey,
      counts,
      candidateCount: candidates.length,
    };
  } finally {
    clearBytes(match.oldWrappingKey);
  }
}
