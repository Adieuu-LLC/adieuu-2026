/**
 * Security details for a conversation member: per-device safety fingerprints
 * and optional QR codes. Fetches public keys when opened (authorized for shared chats).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { QRCodeSVG } from 'qrcode.react';
import {
  computeSafetyFingerprintDigestV2,
  formatSafetyFingerprintDisplay,
} from '@adieuu/crypto';
import type { IdentityApi, IdentityPublicKeys } from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';

export interface MemberSecurityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  identityId: string | null;
  /** Display name for the dialog title */
  subjectLabel: string;
  identityApi: IdentityApi;
}

type DeviceRow =
  | {
      deviceId: string;
      name: string;
      kind: 'ok';
      display: string;
      qrPayload: string;
    }
  | {
      deviceId: string;
      name: string;
      kind: 'noSpk' | 'verifyFailed';
    };

function buildDeviceRows(keys: IdentityPublicKeys): DeviceRow[] {
  const rows: DeviceRow[] = [];
  for (const d of keys.devices) {
    if (d.signedPreKey == null) {
      rows.push({ deviceId: d.deviceId, name: d.name, kind: 'noSpk' });
      continue;
    }
    try {
      const digest = computeSafetyFingerprintDigestV2({
        profile: keys.preferredCryptoProfile,
        signingPublicKeyB64: keys.signingPublicKey,
        deviceId: d.deviceId,
        signedPreKey: {
          keyId: d.signedPreKey.keyId,
          ecdhPublicKey: d.signedPreKey.ecdhPublicKey,
          kemPublicKey: d.signedPreKey.kemPublicKey,
          signature: d.signedPreKey.signature,
        },
      });
      const display = formatSafetyFingerprintDisplay(digest);
      const qrPayload = display.replace(/\s+/g, '');
      rows.push({
        deviceId: d.deviceId,
        name: d.name,
        kind: 'ok',
        display,
        qrPayload,
      });
    } catch {
      rows.push({ deviceId: d.deviceId, name: d.name, kind: 'verifyFailed' });
    }
  }
  return rows;
}

export function MemberSecurityModal({
  open,
  onOpenChange,
  identityId,
  subjectLabel,
  identityApi,
}: MemberSecurityModalProps) {
  const { t } = useTranslation();
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [keys, setKeys] = useState<IdentityPublicKeys | null>(null);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!open || !identityId) {
      setKeys(null);
      setFetchError(null);
      setShowQr(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setFetchError(null);
    setKeys(null);

    void identityApi.getPublicKeys(identityId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success || !res.data) {
        setFetchError(res.error?.message ?? t('conversations.memberSecurity.loadError', 'Could not load security information.'));
        return;
      }
      setKeys(res.data);
    });

    return () => {
      cancelled = true;
    };
  }, [open, identityId, identityApi, t]);

  const deviceRows = useMemo(() => (keys ? buildDeviceRows(keys) : []), [keys]);

  const copyFingerprint = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text).then(
        () => {
          toastSuccess(t('conversations.memberSecurity.copied', 'Fingerprint copied'));
        },
        () => {
          toastError(t('conversations.memberSecurity.copyFailed', 'Could not copy to clipboard'));
        },
      );
    },
    [toastSuccess, toastError, t],
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content member-security-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('conversations.memberSecurity.title', { name: subjectLabel })}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body member-security-modal-body">
              <Dialog.Description className="confirm-dialog-description member-security-modal-intro">
                {t(
                  'conversations.memberSecurity.intro',
                  'Compare these device codes with your contact out-of-band to detect tampering.',
                )}
              </Dialog.Description>

              {loading && (
                <p className="member-security-modal-status">{t('common.loading')}</p>
              )}

              {!loading && fetchError && (
                <p className="member-security-modal-error" role="alert">
                  {fetchError}
                </p>
              )}

              {!loading && keys && deviceRows.length === 0 && (
                <p className="member-security-modal-status">
                  {t('conversations.memberSecurity.noDevices', 'No devices registered for this identity.')}
                </p>
              )}

              {!loading && keys && deviceRows.length > 0 && (
                <>
                  <label className="member-security-modal-qr-toggle">
                    <input
                      type="checkbox"
                      checked={showQr}
                      onChange={(e) => setShowQr(e.target.checked)}
                    />
                    {t('conversations.memberSecurity.showQr', 'Show QR codes')}
                  </label>

                  <ul className="member-security-modal-device-list">
                    {deviceRows.map((row) => (
                      <li key={row.deviceId} className="member-security-modal-device">
                        <div className="member-security-modal-device-header">
                          <span className="member-security-modal-device-name">{row.name}</span>
                          <span className="member-security-modal-device-id" title={row.deviceId}>
                            {row.deviceId}
                          </span>
                        </div>
                        {row.kind === 'ok' && (
                          <>
                            <code className="member-security-modal-fingerprint">
                              {row.display}
                            </code>
                            <div className="member-security-modal-device-actions">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => copyFingerprint(row.display)}
                              >
                                <Icon name="copy" />
                                {t('common.copy')}
                              </Button>
                            </div>
                            {showQr && (
                              <div className="member-security-modal-qr-wrap" aria-hidden={false}>
                                <QRCodeSVG
                                  value={row.qrPayload}
                                  size={128}
                                  className="member-security-modal-qr"
                                />
                              </div>
                            )}
                          </>
                        )}
                        {row.kind === 'noSpk' && (
                          <p className="member-security-modal-device-unavailable">
                            {t(
                              'conversations.memberSecurity.spkUnavailable',
                              'Safety code unavailable (signed pre-key not exposed for this view).',
                            )}
                          </p>
                        )}
                        {row.kind === 'verifyFailed' && (
                          <p className="member-security-modal-device-unavailable">
                            {t(
                              'conversations.memberSecurity.verifyFailed',
                              'Safety code could not be verified for this device.',
                            )}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            <div className="confirm-dialog-footer">
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>
                {t('common.close')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
