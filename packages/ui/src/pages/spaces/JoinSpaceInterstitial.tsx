/**
 * Join interstitial shown before joining any Space.
 *
 * Displays Space info, a rules placeholder, and (when a cipherCheck is present)
 * client-side Cipher detection against local Ciphers. Join may be gated by
 * `cipherRequired` (client-only). Non-E2EE Spaces also offer Browse (read-only).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { createApiClient, type PublicSpace } from '@adieuu/shared';
import { useAppConfig } from '../../config';
import { useCipherStore } from '../../hooks/useCipherStore';
import {
  detectSpaceCipher,
  verifySpaceCipherCheck,
} from '../../services/spaceCipherService';
import { emitSpacesChanged } from '../../services/spacesMembershipEvents';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';
import {
  SpaceCipherFormFields,
  type CipherSource,
  type EntropyRow,
} from './SpaceCipherFormFields';
import { resolveSpaceCipherSelection } from './resolveSpaceCipherSelection';
import { isJoinAllowed, type CipherDetectStatus } from './joinSpaceGate';

export type { CipherDetectStatus } from './joinSpaceGate';
export { isJoinAllowed } from './joinSpaceGate';

export interface JoinSpaceInterstitialProps {
  space: PublicSpace | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful join (before navigate). */
  onJoined?: (space: PublicSpace) => void;
}

export function JoinSpaceInterstitial({
  space,
  open,
  onOpenChange,
  onJoined,
}: JoinSpaceInterstitialProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const {
    ciphers,
    getCipherKey,
    createCipher,
    bookmarkSpaceCipher,
    findLocalIdByCipherId,
    encryptionAvailable,
  } = useCipherStore();

  const [detectStatus, setDetectStatus] = useState<CipherDetectStatus>('idle');
  const [matchedLocalId, setMatchedLocalId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [showAddCipher, setShowAddCipher] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [cipherSource, setCipherSource] = useState<CipherSource>('existing');
  const [selectedCipherId, setSelectedCipherId] = useState('');
  const [newCipherName, setNewCipherName] = useState('');
  const [entropyRows, setEntropyRows] = useState<EntropyRow[]>([{ id: '1', value: '' }]);

  const detectSeq = useRef(0);

  const canBrowse = !!space && !space.e2ee && space.visibility !== 'hidden';
  const hasCipherCheck = !!space?.cipherCheck;
  const cipherRequired = !!space?.cipherRequired;
  const joinAllowed = isJoinAllowed({ hasCipherCheck, cipherRequired, detectStatus });

  const runDetect = useCallback(async () => {
    if (!space?.cipherCheck) {
      setDetectStatus('idle');
      setMatchedLocalId(null);
      return;
    }
    if (!encryptionAvailable || ciphers.length === 0) {
      setDetectStatus('unavailable');
      setMatchedLocalId(null);
      return;
    }

    const seq = ++detectSeq.current;
    setDetectStatus('checking');
    setMatchedLocalId(null);

    const candidates = ciphers
      .map((c) => getCipherKey(c.id))
      .filter((c): c is NonNullable<typeof c> => !!c);

    const found = await detectSpaceCipher(candidates, space.id, space.cipherCheck);
    if (seq !== detectSeq.current) return;

    if (!found) {
      setDetectStatus('missing');
      return;
    }

    const localId = findLocalIdByCipherId(found.cipherId);
    if (!localId) {
      setDetectStatus('missing');
      return;
    }

    await bookmarkSpaceCipher(localId, space.id);
    if (seq !== detectSeq.current) return;
    setMatchedLocalId(localId);
    setDetectStatus('matched');
  }, [
    space,
    encryptionAvailable,
    ciphers,
    getCipherKey,
    findLocalIdByCipherId,
    bookmarkSpaceCipher,
  ]);

  useEffect(() => {
    if (!open || !space) {
      // Cancel any in-flight detect; do not setState while closed (avoids loops
      // when the parent keeps this mounted with space=null / open=false).
      detectSeq.current += 1;
      return;
    }

    setDetectStatus('idle');
    setMatchedLocalId(null);
    setShowAddCipher(false);
    setAddError(null);
    setCipherSource('existing');
    setSelectedCipherId('');
    setNewCipherName('');
    setEntropyRows([{ id: '1', value: '' }]);
    void runDetect();

    return () => {
      detectSeq.current += 1;
    };
    // Intentionally key only on open + space id; runDetect is recreated often.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, space?.id]);

  const handleBrowse = useCallback(() => {
    if (!space) return;
    onOpenChange(false);
    navigate(`/s/${space.slug}`);
  }, [space, onOpenChange, navigate]);

  const handleJoin = useCallback(async () => {
    if (!space || joining || !joinAllowed) return;
    setJoining(true);
    try {
      const res = await api.spaces.join(space.id);
      if (res.success || res.error?.code === 'ALREADY_MEMBER') {
        if (res.success) {
          toast.success(t('spaces.joinSuccess', { name: space.name }));
          emitSpacesChanged();
        }
        onJoined?.(space);
        onOpenChange(false);
        navigate(`/s/${space.slug}`);
        return;
      }
      toast.error(res.error?.message ?? t('spaces.joinError'));
    } catch {
      toast.error(t('spaces.joinError'));
    } finally {
      setJoining(false);
    }
  }, [space, joining, joinAllowed, api, toast, t, onJoined, onOpenChange, navigate]);

  const handleAddCipher = useCallback(async () => {
    if (!space?.cipherCheck || adding) return;
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
        fallbackName: space.name,
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

      const ok = await verifySpaceCipherCheck(
        resolved.cipher,
        space.id,
        space.cipherCheck,
      );
      if (!ok) {
        setAddError(t('spaces.joinModal.cipherMismatch'));
        return;
      }

      await bookmarkSpaceCipher(resolved.localId, space.id);
      setMatchedLocalId(resolved.localId);
      setDetectStatus('matched');
      setShowAddCipher(false);
    } finally {
      setAdding(false);
    }
  }, [
    space,
    adding,
    cipherSource,
    selectedCipherId,
    getCipherKey,
    entropyRows,
    createCipher,
    newCipherName,
    bookmarkSpaceCipher,
    t,
  ]);

  if (!space) return null;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(d) => onOpenChange(d.open)}
      closeOnInteractOutside={!joining && !adding}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="join-space-dialog-content">
            <Dialog.Title className="join-space-dialog-title">{space.name}</Dialog.Title>
            <p className="join-space-dialog-slug">/s/{space.slug}</p>

            <div className="join-space-dialog-badges">
              <span className="spaces-badge">{t(`spaces.visibility.${space.visibility}`)}</span>
              {space.e2ee && (
                <span className="spaces-badge spaces-badge--encrypted">
                  {t('spaces.encrypted')}
                </span>
              )}
              {space.cipherRequired && (
                <span className="spaces-badge">{t('spaces.joinModal.cipherRequiredBadge')}</span>
              )}
            </div>

            {space.description && (
              <p className="join-space-dialog-description">{space.description}</p>
            )}

            <p className="join-space-dialog-meta">
              {t('spaces.memberCount', { count: space.memberCount })}
            </p>

            <section className="join-space-dialog-section">
              <h3 className="join-space-dialog-section-title">{t('spaces.joinModal.rulesTitle')}</h3>
              <p className="join-space-dialog-section-body">{t('spaces.joinModal.rulesPlaceholder')}</p>
            </section>

            {hasCipherCheck && (
              <section className="join-space-dialog-section">
                <h3 className="join-space-dialog-section-title">{t('spaces.joinModal.cipherTitle')}</h3>
                {detectStatus === 'checking' && (
                  <div className="join-space-dialog-detecting">
                    <Spinner size="sm" />
                    <span>{t('spaces.joinModal.cipherChecking')}</span>
                  </div>
                )}
                {detectStatus === 'matched' && (
                  <p className="join-space-dialog-section-body join-space-dialog-ok">
                    {t('spaces.joinModal.cipherMatched')}
                  </p>
                )}
                {detectStatus === 'missing' && (
                  <p className="join-space-dialog-section-body">
                    {cipherRequired
                      ? t('spaces.joinModal.cipherMissingRequired')
                      : t('spaces.joinModal.cipherMissingOptional')}
                  </p>
                )}
                {detectStatus === 'unavailable' && (
                  <p className="join-space-dialog-section-body">
                    {cipherRequired
                      ? t('spaces.joinModal.cipherUnavailableRequired')
                      : t('spaces.joinModal.cipherUnavailableOptional')}
                  </p>
                )}

                {(detectStatus === 'missing' || detectStatus === 'unavailable') && (
                  <div className="join-space-dialog-cipher-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => void runDetect()}
                      disabled={detectStatus === 'checking' || !encryptionAvailable}
                    >
                      {t('spaces.joinModal.checkCiphers')}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowAddCipher((v) => !v)}
                      disabled={!encryptionAvailable}
                    >
                      {t('spaces.joinModal.addCipher')}
                    </Button>
                  </div>
                )}

                {showAddCipher && encryptionAvailable && (
                  <div className="join-space-dialog-add-cipher">
                    {addError && <p className="join-space-dialog-error">{addError}</p>}
                    <SpaceCipherFormFields
                      idPrefix="join-cipher"
                      cipherSource={cipherSource}
                      onCipherSourceChange={setCipherSource}
                      ciphers={ciphers}
                      selectedCipherId={selectedCipherId}
                      onSelectedCipherIdChange={setSelectedCipherId}
                      newCipherName={newCipherName}
                      onNewCipherNameChange={setNewCipherName}
                      entropyRows={entropyRows}
                      onEntropyRowChange={(id, value) =>
                        setEntropyRows((rows) =>
                          rows.map((r) => (r.id === id ? { ...r, value } : r)),
                        )
                      }
                      onAddEntropyRow={() =>
                        setEntropyRows((rows) => [
                          ...rows,
                          { id: `${Date.now()}`, value: '' },
                        ])
                      }
                      onRemoveEntropyRow={(id) =>
                        setEntropyRows((rows) => rows.filter((r) => r.id !== id))
                      }
                      disabled={adding}
                    />
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => void handleAddCipher()}
                      disabled={adding}
                    >
                      {adding
                        ? t('spaces.joinModal.addingCipher')
                        : t('spaces.joinModal.confirmAddCipher')}
                    </Button>
                  </div>
                )}
              </section>
            )}

            <div className="join-space-dialog-actions">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={joining}
              >
                {t('spaces.joinModal.cancel')}
              </Button>
              {canBrowse && (
                <Button type="button" variant="secondary" onClick={handleBrowse} disabled={joining}>
                  {t('spaces.joinModal.browse')}
                </Button>
              )}
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleJoin()}
                disabled={joining || !joinAllowed || detectStatus === 'checking'}
              >
                {joining ? t('spaces.joining') : t('spaces.join')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
