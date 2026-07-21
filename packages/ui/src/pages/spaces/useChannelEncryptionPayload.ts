/**
 * Shared encryption payload resolution for ChannelSettingsModal.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { CommunityCipher } from '@adieuu/crypto';
import type { CipherCheck, PublicSpace } from '@adieuu/shared';
import { createSpaceCipherCheck, getSpaceCipherLink } from '../../services/spaceCipherService';
import type { CipherSource, EntropyRow } from './SpaceCipherFormFields';
import {
  resolveSpaceCipherSelection,
  type ResolveSpaceCipherSelectionParams,
} from './resolveSpaceCipherSelection';

export type ResolvedChannelEncryption =
  | { kind: 'unchanged' }
  | { kind: 'off' }
  | { kind: 'on'; cipherCheck: CipherCheck; localCipherId: string; needsConfirm: boolean };

export function useChannelEncryptionPayload(args: {
  inheritCipher: boolean;
  forceCipher: boolean;
  encrypt: boolean;
  storedCipherCheck: CipherCheck | null;
  encryptionSelectionChanged: () => boolean;
  encryptionAvailable: boolean;
  cipherSource: CipherSource;
  selectedCipherId: string;
  space: Pick<PublicSpace, 'id' | 'name' | 'e2ee' | 'cipherCheck'>;
  getCipherKey: (id: string) => CommunityCipher | null;
  entropyRows: EntropyRow[];
  createCipher: ResolveSpaceCipherSelectionParams['createCipher'];
  newCipherName: string;
  name: string;
  isEdit: boolean;
}) {
  const { t } = useTranslation();
  const {
    inheritCipher,
    forceCipher,
    encrypt,
    storedCipherCheck,
    encryptionSelectionChanged,
    encryptionAvailable,
    cipherSource,
    selectedCipherId,
    space,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    name,
    isEdit,
  } = args;

  return useCallback(async (): Promise<
    | { ok: true; value: ResolvedChannelEncryption }
    | { ok: false; error: string }
  > => {
    if (inheritCipher || forceCipher) {
      return { ok: true, value: { kind: 'unchanged' } };
    }

    if (!encrypt) {
      return {
        ok: true,
        value: storedCipherCheck ? { kind: 'off' } : { kind: 'unchanged' },
      };
    }

    if (!encryptionSelectionChanged()) {
      return { ok: true, value: { kind: 'unchanged' } };
    }

    if (!encryptionAvailable) {
      return { ok: false, error: t('spaces.create.errors.cipherRequired') };
    }

    if (cipherSource === 'existing' && !selectedCipherId && space.cipherCheck) {
      return {
        ok: true,
        value: {
          kind: 'on',
          cipherCheck: space.cipherCheck,
          localCipherId: getSpaceCipherLink(space.id) ?? '',
          needsConfirm: isEdit,
        },
      };
    }

    const resolved = await resolveSpaceCipherSelection({
      cipherSource,
      selectedCipherId,
      getCipherKey,
      entropyRows,
      createCipher,
      newCipherName,
      fallbackName: name.trim() || space.name || 'Channel Cipher',
      errors: {
        cipherRequired: t('spaces.create.errors.cipherRequired'),
        entropyRequired: t('spaces.create.errors.entropyRequired'),
        createFailed: t('spaces.create.errors.createFailed'),
      },
    });
    if ('error' in resolved) return { ok: false, error: resolved.error };

    try {
      const cipherCheck = await createSpaceCipherCheck(resolved.cipher, space.id);
      return {
        ok: true,
        value: {
          kind: 'on',
          cipherCheck,
          localCipherId: resolved.localId,
          needsConfirm: isEdit,
        },
      };
    } catch {
      return { ok: false, error: t('spaces.create.errors.createFailed') };
    }
  }, [
    inheritCipher,
    forceCipher,
    encrypt,
    storedCipherCheck,
    encryptionSelectionChanged,
    encryptionAvailable,
    cipherSource,
    selectedCipherId,
    space,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    name,
    isEdit,
    t,
  ]);
}
