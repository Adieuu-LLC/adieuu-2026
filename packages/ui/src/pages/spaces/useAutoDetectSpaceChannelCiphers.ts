/**
 * On first enter of an encrypted Space, auto-run client-side cipher detection
 * against unique space/channel/category challenges so sidebar names unlock
 * without opening each channel's Cipher gate.
 */

import { useEffect, useRef } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import type {
  CipherCheck,
  PublicSpace,
  PublicSpaceChannel,
  PublicSpaceChannelCategory,
} from '@adieuu/shared';
import { useCipherStore } from '../../hooks/useCipherStore';
import { useSpaces } from '../../hooks/useSpaces';
import {
  detectSpaceCipher,
  getSpaceCipherLink,
  registerCategoryCipherLink,
  registerChannelCipherLink,
} from '../../services/spaceCipherService';
import { resolveChannelDisplayName } from './spaceMetadataCipher';

/** Spaces we have already attempted auto-detect for in this page session. */
const attemptedSpaceIds = new Set<string>();

/** Test helper — clears the once-per-space session guard. */
export function resetAutoDetectSpaceChannelCiphersAttempts(): void {
  attemptedSpaceIds.clear();
}

export function cipherCheckFingerprint(check: CipherCheck): string {
  return `${check.knownValue}\0${check.nonce}\0${check.encryptedKnownValue}`;
}

type NamedEncrypted = Pick<
  PublicSpaceChannel,
  'encryptedName' | 'nameNonce' | 'cipherId' | 'name'
>;

function hasEncryptedName(item: NamedEncrypted): boolean {
  return !!(item.encryptedName && item.nameNonce && item.cipherId);
}

function namesStillLocked(
  spaceCipher: CommunityCipher | null,
  channels: readonly NamedEncrypted[],
  categories: readonly NamedEncrypted[],
): boolean {
  const placeholders = { encryptedChannel: '' };
  for (const item of [...channels, ...categories]) {
    if (!hasEncryptedName(item)) continue;
    const resolved = resolveChannelDisplayName(item, spaceCipher, placeholders);
    if (!resolved) return true;
  }
  return false;
}

export interface AutoDetectSpaceChannelCiphersInput {
  space: Pick<PublicSpace, 'id' | 'e2ee' | 'cipherCheck'>;
  channels: readonly Pick<
    PublicSpaceChannel,
    'id' | 'name' | 'encryptedName' | 'nameNonce' | 'cipherId' | 'cipherCheck'
  >[];
  categories: readonly Pick<
    PublicSpaceChannelCategory,
    'id' | 'name' | 'encryptedName' | 'nameNonce' | 'cipherId' | 'cipherCheck'
  >[];
  candidates: readonly CommunityCipher[];
  getCipherKey: (localId: string) => CommunityCipher | null;
  findLocalIdByCipherId: (cipherId: string) => string | undefined;
  bookmarkSpaceCipher: (
    localCipherId: string,
    spaceId: string,
  ) => Promise<{ success: boolean; error?: string }>;
  /**
   * Injected for tests. Defaults to {@link detectSpaceCipher}.
   */
  detect?: typeof detectSpaceCipher;
  /**
   * When true, ignore the once-per-space session guard (tests only).
   */
  force?: boolean;
}

export type AutoDetectSpaceChannelCiphersResult =
  | { status: 'skipped'; reason: 'already_attempted' | 'not_encrypted' | 'already_unlocked' | 'no_candidates' }
  | { status: 'attempted'; matchedChecks: number; detectCalls: number };

/**
 * Pure auto-detect pass. Dedupes identical cipherChecks so the common
 * "channels inherit the space challenge" case pays Argon2 once.
 */
export async function autoDetectSpaceChannelCiphers(
  input: AutoDetectSpaceChannelCiphersInput,
): Promise<AutoDetectSpaceChannelCiphersResult> {
  const {
    space,
    channels,
    categories,
    candidates,
    getCipherKey,
    findLocalIdByCipherId,
    bookmarkSpaceCipher,
    detect = detectSpaceCipher,
    force = false,
  } = input;

  if (!force && attemptedSpaceIds.has(space.id)) {
    return { status: 'skipped', reason: 'already_attempted' };
  }

  const isEncrypted =
    !!space.e2ee ||
    !!space.cipherCheck ||
    channels.some((c) => !!c.cipherCheck || hasEncryptedName(c)) ||
    categories.some((c) => !!c.cipherCheck || hasEncryptedName(c));

  if (!isEncrypted) {
    attemptedSpaceIds.add(space.id);
    return { status: 'skipped', reason: 'not_encrypted' };
  }

  const linkedLocalId = getSpaceCipherLink(space.id);
  const spaceCipher = linkedLocalId ? getCipherKey(linkedLocalId) : null;
  const needsUnlock =
    !linkedLocalId || !spaceCipher || namesStillLocked(spaceCipher, channels, categories);

  if (!needsUnlock) {
    attemptedSpaceIds.add(space.id);
    return { status: 'skipped', reason: 'already_unlocked' };
  }

  if (candidates.length === 0) {
    return { status: 'skipped', reason: 'no_candidates' };
  }

  type CheckGroup = {
    check: CipherCheck;
    channelIds: string[];
    categoryIds: string[];
    isSpace: boolean;
  };

  const groups = new Map<string, CheckGroup>();

  const addCheck = (
    check: CipherCheck | undefined,
    opts: { channelId?: string; categoryId?: string; isSpace?: boolean },
  ) => {
    if (!check) return;
    const fp = cipherCheckFingerprint(check);
    let group = groups.get(fp);
    if (!group) {
      group = { check, channelIds: [], categoryIds: [], isSpace: false };
      groups.set(fp, group);
    }
    if (opts.isSpace) group.isSpace = true;
    if (opts.channelId) group.channelIds.push(opts.channelId);
    if (opts.categoryId) group.categoryIds.push(opts.categoryId);
  };

  addCheck(space.cipherCheck, { isSpace: true });
  for (const ch of channels) {
    addCheck(ch.cipherCheck, { channelId: ch.id });
  }
  for (const cat of categories) {
    addCheck(cat.cipherCheck, { categoryId: cat.id });
  }

  if (groups.size === 0) {
    attemptedSpaceIds.add(space.id);
    return { status: 'skipped', reason: 'not_encrypted' };
  }

  // Mark before awaiting so concurrent runs do not double-detect.
  attemptedSpaceIds.add(space.id);

  let matchedChecks = 0;
  let detectCalls = 0;

  for (const group of groups.values()) {
    detectCalls += 1;
    const found = await detect(candidates, space.id, group.check);
    if (!found) continue;

    const localId = findLocalIdByCipherId(found.cipherId);
    if (!localId) continue;

    matchedChecks += 1;
    await bookmarkSpaceCipher(localId, space.id);

    for (const channelId of group.channelIds) {
      registerChannelCipherLink(channelId, localId);
    }
    for (const categoryId of group.categoryIds) {
      registerCategoryCipherLink(categoryId, localId);
    }

    // Encrypted names with no per-item challenge inherit the space Cipher.
    if (group.isSpace) {
      for (const ch of channels) {
        if (!ch.cipherCheck && hasEncryptedName(ch)) {
          registerChannelCipherLink(ch.id, localId);
        }
      }
      for (const cat of categories) {
        if (!cat.cipherCheck && hasEncryptedName(cat)) {
          registerCategoryCipherLink(cat.id, localId);
        }
      }
    }
  }

  return { status: 'attempted', matchedChecks, detectCalls };
}

/**
 * Runs {@link autoDetectSpaceChannelCiphers} once per Space when the layout
 * has loaded channels and the cipher store is ready.
 */
export function useAutoDetectSpaceChannelCiphers(): void {
  const { activeSpace, channels, categories } = useSpaces();
  const {
    ciphers,
    loading,
    encryptionAvailable,
    getCipherKey,
    findLocalIdByCipherId,
    bookmarkSpaceCipher,
  } = useCipherStore();

  const runningRef = useRef(false);

  useEffect(() => {
    if (!activeSpace || loading || !encryptionAvailable || runningRef.current) {
      return;
    }
    if (attemptedSpaceIds.has(activeSpace.id)) return;

    const candidates = ciphers
      .map((c) => getCipherKey(c.id))
      .filter((c): c is CommunityCipher => !!c);

    runningRef.current = true;
    void autoDetectSpaceChannelCiphers({
      space: activeSpace,
      channels,
      categories,
      candidates,
      getCipherKey,
      findLocalIdByCipherId,
      bookmarkSpaceCipher,
    }).finally(() => {
      runningRef.current = false;
    });
  }, [
    activeSpace,
    channels,
    categories,
    ciphers,
    loading,
    encryptionAvailable,
    getCipherKey,
    findLocalIdByCipherId,
    bookmarkSpaceCipher,
  ]);
}
