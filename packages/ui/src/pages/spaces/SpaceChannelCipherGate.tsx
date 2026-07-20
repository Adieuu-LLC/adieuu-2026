/**
 * Composer replacement when an E2EE Space channel has no linked Cipher.
 * Offers detect-against-local-ciphers and add-cipher recovery flows.
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CipherCheck } from '@adieuu/shared';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  detectSpaceCipher,
  registerChannelCipherLink,
  verifySpaceCipherCheck,
} from '../../services/spaceCipherService';
import { Button } from '../../components/Button';
import {
  SpaceCipherFormFields,
  type CipherSource,
  type EntropyRow,
} from './SpaceCipherFormFields';
import { resolveSpaceCipherSelection } from './resolveSpaceCipherSelection';

export interface SpaceChannelCipherGateProps {
  spaceId: string;
  /** When set, the linked Cipher is also bound to this channel. */
  channelId?: string;
  cipherCheck: CipherCheck;
  /** Invoked after a Cipher is successfully bookmarked for this Space. */
  onCipherLinked: () => void;
}

export function SpaceChannelCipherGate({
  spaceId,
  channelId,
  cipherCheck,
  onCipherLinked,
}: SpaceChannelCipherGateProps) {
  const { t } = useTranslation();
  const {
    ciphers,
    getCipherKey,
    createCipher,
    bookmarkSpaceCipher,
    findLocalIdByCipherId,
    encryptionAvailable,
  } = useCipherStore();

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);

  const handleCheck = useCallback(async () => {
    if (checking || !encryptionAvailable) return;
    setChecking(true);
    setStatusMsg(null);
    try {
      const candidates = ciphers
        .map((c) => getCipherKey(c.id))
        .filter((c): c is NonNullable<typeof c> => !!c);
      const found = await detectSpaceCipher(candidates, spaceId, cipherCheck);
      if (!found) {
        setStatusMsg(t('spaces.channel.cipherStillMissing'));
        return;
      }
      const localId = findLocalIdByCipherId(found.cipherId);
      if (!localId) {
        setStatusMsg(t('spaces.channel.cipherStillMissing'));
        return;
      }
      await bookmarkSpaceCipher(localId, spaceId);
      if (channelId) registerChannelCipherLink(channelId, localId);
      setStatusMsg(t('spaces.channel.cipherFound'));
      onCipherLinked();
    } catch {
      setStatusMsg(t('spaces.channel.cipherStillMissing'));
    } finally {
      setChecking(false);
    }
  }, [
    checking,
    encryptionAvailable,
    ciphers,
    getCipherKey,
    spaceId,
    channelId,
    cipherCheck,
    findLocalIdByCipherId,
    bookmarkSpaceCipher,
    onCipherLinked,
    t,
  ]);

  const handleAdd = useCallback(async () => {
    if (adding) return;
    setAddError(null);
    setAdding(true);
    try {
      const resolved = await resolveSpaceCipherSelection({
        cipherSource,
        selectedCipherId,
        getCipherKey,
        entropyRows,
        createCipher,
        newCipherName,
        fallbackName: 'Space Cipher',
        errors: {
          cipherRequired: t('spaces.create.errors.cipherRequired'),
          entropyRequired: t('spaces.create.errors.entropyRequired'),
          createFailed: t('spaces.create.errors.createFailed'),
        },
      });
      if ('error' in resolved) {
        setAddError(resolved.error);
        return;
      }
      const ok = await verifySpaceCipherCheck(resolved.cipher, spaceId, cipherCheck);
      if (!ok) {
        setAddError(t('spaces.joinModal.cipherMismatch'));
        return;
      }
      await bookmarkSpaceCipher(resolved.localId, spaceId);
      if (channelId) registerChannelCipherLink(channelId, resolved.localId);
      setStatusMsg(t('spaces.channel.cipherFound'));
      onCipherLinked();
    } catch {
      setAddError(t('spaces.create.errors.createFailed'));
    } finally {
      setAdding(false);
    }
  }, [
    adding,
    cipherSource,
    selectedCipherId,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    spaceId,
    channelId,
    cipherCheck,
    bookmarkSpaceCipher,
    onCipherLinked,
    t,
  ]);

  return (
    <div className="space-channel-no-cipher">
      <p className="spaces-state-body">{t('spaces.channel.noCipher')}</p>
      {statusMsg && <p className="join-space-dialog-ok">{statusMsg}</p>}
      <div className="join-space-dialog-cipher-actions">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleCheck()}
          disabled={checking || !encryptionAvailable}
        >
          {checking ? t('spaces.channel.checkingCiphers') : t('spaces.channel.checkCiphers')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setShowAdd((v) => !v)}
          disabled={!encryptionAvailable}
        >
          {t('spaces.channel.addCipher')}
        </Button>
      </div>
      {showAdd && encryptionAvailable && (
        <div className="join-space-dialog-add-cipher">
          {addError && <p className="join-space-dialog-error">{addError}</p>}
          <SpaceCipherFormFields
            idPrefix="channel-cipher"
            cipherSource={cipherSource}
            onCipherSourceChange={setCipherSource}
            ciphers={ciphers}
            selectedCipherId={selectedCipherId}
            onSelectedCipherIdChange={setSelectedCipherId}
            newCipherName={newCipherName}
            onNewCipherNameChange={setNewCipherName}
            entropyRows={entropyRows}
            onEntropyRowChange={(id, value) =>
              setEntropyRows((rows) => rows.map((r) => (r.id === id ? { ...r, value } : r)))
            }
            onAddEntropyRow={() =>
              setEntropyRows((rows) => [...rows, { id: `${Date.now()}`, value: '' }])
            }
            onRemoveEntropyRow={(id) =>
              setEntropyRows((rows) => (rows.length <= 1 ? rows : rows.filter((r) => r.id !== id)))
            }
            disabled={adding}
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleAdd()}
            disabled={adding}
          >
            {adding ? t('spaces.joinModal.addingCipher') : t('spaces.joinModal.confirmAddCipher')}
          </Button>
        </div>
      )}
    </div>
  );
}
