/**
 * Resolve the bookmarked Community Cipher for a Space (if any).
 */

import { useMemo, useState, useCallback } from 'react';
import type { CommunityCipher } from '@adieuu/crypto';
import { useCipherStore } from '../../hooks/useCipherStore';
import { getSpaceCipherLink } from '../../services/spaceCipherService';

/**
 * Returns the unlocked Cipher linked to `spaceId`, or null when missing /
 * locked. Call `bumpCipherLink` after bookmark/detect recovery so the
 * memo re-resolves.
 */
export function useSpaceCipher(spaceId: string | null | undefined): {
  spaceCipher: CommunityCipher | null;
  bumpCipherLink: () => void;
} {
  const { getCipherKey } = useCipherStore();
  const [cipherLinkVersion, setCipherLinkVersion] = useState(0);

  const bumpCipherLink = useCallback(() => {
    setCipherLinkVersion((v) => v + 1);
  }, []);

  const spaceCipher = useMemo(() => {
    if (!spaceId) return null;
    const localCipherId = getSpaceCipherLink(spaceId);
    if (!localCipherId) return null;
    return getCipherKey(localCipherId);
    // cipherLinkVersion forces re-resolve after bookmark/detect recovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional bump
  }, [spaceId, getCipherKey, cipherLinkVersion]);

  return { spaceCipher, bumpCipherLink };
}
