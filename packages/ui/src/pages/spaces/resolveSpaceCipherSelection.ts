/**
 * Resolves an existing or newly-created Community Cipher from form state.
 * Shared by CreateSpace, join interstitial, and channel Cipher recovery.
 */

import { createTextEntropy, type CommunityCipher } from '@adieuu/crypto';
import type { CipherSource, EntropyRow } from './SpaceCipherFormFields';

export interface ResolveSpaceCipherSelectionParams {
  cipherSource: CipherSource;
  selectedCipherId: string;
  getCipherKey: (id: string) => CommunityCipher | null;
  entropyRows: EntropyRow[];
  createCipher: (input: {
    name: string;
    entropyPieces: ReturnType<typeof createTextEntropy>[];
  }) => Promise<{ success: boolean; cipher?: { id: string }; error?: string }>;
  newCipherName: string;
  fallbackName: string;
  errors: {
    cipherRequired: string;
    entropyRequired: string;
    createFailed: string;
  };
}

export async function resolveSpaceCipherSelection(
  params: ResolveSpaceCipherSelectionParams,
): Promise<{ localId: string; cipher: CommunityCipher } | { error: string }> {
  const {
    cipherSource,
    selectedCipherId,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    fallbackName,
    errors,
  } = params;

  if (cipherSource === 'existing') {
    if (!selectedCipherId) return { error: errors.cipherRequired };
    const cipher = getCipherKey(selectedCipherId);
    if (!cipher) return { error: errors.cipherRequired };
    return { localId: selectedCipherId, cipher };
  }

  const pieces = entropyRows
    .filter((r) => r.value.trim().length > 0)
    .map((r, idx) => createTextEntropy(r.value.trim(), `Phrase ${idx + 1}`));
  if (pieces.length === 0) return { error: errors.entropyRequired };

  const result = await createCipher({
    name: newCipherName.trim() || fallbackName || 'Space Cipher',
    entropyPieces: pieces,
  });
  if (!result.success || !result.cipher) {
    return { error: result.error ?? errors.createFailed };
  }
  const cipher = getCipherKey(result.cipher.id);
  if (!cipher) return { error: errors.createFailed };
  return { localId: result.cipher.id, cipher };
}
