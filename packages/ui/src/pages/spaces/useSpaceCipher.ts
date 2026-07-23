/**
 * Resolve the bookmarked Community Cipher for a Space (if any).
 */

import { useMemo, useCallback, useSyncExternalStore } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  bumpCipherLinkEpoch,
  getCipherLinkEpoch,
  getSpaceCipherLink,
  subscribeCipherLinks,
} from '../../services/spaceCipherService';

/**
 * Returns the unlocked Cipher linked to `spaceId`, or null when missing /
 * locked. Re-resolves automatically when cipher links change (hydrate,
 * bookmark, detect). Call `bumpCipherLink` only if you need a manual refresh.
 */
export function useSpaceCipher(spaceId: string | null | undefined): {
  spaceCipher: CommunityCipher | null;
  bumpCipherLink: () => void;
} {
  const { getCipherKey } = useCipherStore();
  const linkEpoch = useSyncExternalStore(
    subscribeCipherLinks,
    getCipherLinkEpoch,
    getCipherLinkEpoch,
  );

  const bumpCipherLink = useCallback(() => {
    bumpCipherLinkEpoch();
  }, []);

  const spaceCipher = useMemo(() => {
    if (!spaceId) return null;
    const localCipherId = getSpaceCipherLink(spaceId);
    if (!localCipherId) return null;
    return getCipherKey(localCipherId);
  }, [spaceId, getCipherKey, linkEpoch]);

  return { spaceCipher, bumpCipherLink };
}
