/**
 * Security details for a conversation member: per-device safety fingerprints.
 * Fetches public keys when opened (authorized for shared chats).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccordionRoot,
  AccordionItem,
  AccordionItemTrigger,
  AccordionItemContent,
  AccordionItemIndicator,
  Dialog,
  Portal,
} from '@ark-ui/react';
import { Switch } from '@ark-ui/react';
import type { IdentityApi, IdentityPublicKeys } from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';
import { useToast } from '../../components/Toast';
import {
  clearDeviceSignatureVerification,
  getDeviceSignatureVerification,
  setDeviceSignatureVerification,
} from '../../services/deviceSignatureVerificationStorage';
import { getSafetyFingerprintDisplayForDevice } from '../../services/safetyFingerprintDisplay';

export interface MemberSecurityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Conversation scope for stored verification state */
  conversationId: string | null;
  identityId: string | null;
  /** Display name for the dialog title */
  subjectLabel: string;
  /** True when viewing the current user's signatures (copy is phrased for "you"). */
  isSelfSubject?: boolean;
  identityApi: IdentityApi;
  /** Called after verification is toggled so message rows can re-evaluate */
  onVerificationChange?: () => void;
}

type DeviceRow =
  | {
      deviceId: string;
      ordinal: number;
      kind: 'ok';
      display: string;
    }
  | {
      deviceId: string;
      ordinal: number;
      kind: 'noSpk' | 'verifyFailed';
    };

/** Shorten long ids for display; full id remains in `title` for hover/copy elsewhere. */
function abbreviateDeviceId(deviceId: string): string {
  if (deviceId.length <= 28) return deviceId;
  return `${deviceId.slice(0, 12)}…${deviceId.slice(-10)}`;
}

function buildDeviceRows(keys: IdentityPublicKeys): DeviceRow[] {
  const rows: DeviceRow[] = [];
  keys.devices.forEach((d, index) => {
    const ordinal = index + 1;
    if (d.signedPreKey == null) {
      rows.push({ deviceId: d.deviceId, ordinal, kind: 'noSpk' });
      return;
    }
    const display = getSafetyFingerprintDisplayForDevice(keys, d.deviceId);
    if (display != null) {
      rows.push({
        deviceId: d.deviceId,
        ordinal,
        kind: 'ok',
        display,
      });
    } else {
      rows.push({ deviceId: d.deviceId, ordinal, kind: 'verifyFailed' });
    }
  });
  return rows;
}

export function MemberSecurityModal({
  open,
  onOpenChange,
  conversationId,
  identityId,
  subjectLabel,
  isSelfSubject = false,
  identityApi,
  onVerificationChange,
}: MemberSecurityModalProps) {
  const { t } = useTranslation();
  const { success: toastSuccess, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [keys, setKeys] = useState<IdentityPublicKeys | null>(null);
  const [verifiedDeviceIds, setVerifiedDeviceIds] = useState<Record<string, boolean>>({});
  const [verificationLoading, setVerificationLoading] = useState(false);

  useEffect(() => {
    if (!open || !identityId) {
      setKeys(null);
      setFetchError(null);
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

  useEffect(() => {
    if (!open || !conversationId || !identityId || !keys) {
      setVerifiedDeviceIds({});
      setVerificationLoading(false);
      return;
    }

    let cancelled = false;
    setVerificationLoading(true);
    const okDevices = buildDeviceRows(keys)
      .filter((r): r is { deviceId: string; ordinal: number; kind: 'ok'; display: string } => r.kind === 'ok')
      .map((r) => r.deviceId);

    void Promise.all(
      okDevices.map(async (deviceId) => {
        const rec = await getDeviceSignatureVerification(conversationId, identityId, deviceId);
        return [deviceId, !!rec] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setVerifiedDeviceIds(Object.fromEntries(pairs));
      setVerificationLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, conversationId, identityId, keys]);

  const handleVerifiedChange = useCallback(
    async (deviceId: string, display: string, checked: boolean) => {
      if (!conversationId || !identityId) return;
      try {
        if (checked) {
          await setDeviceSignatureVerification(conversationId, identityId, deviceId, display);
        } else {
          await clearDeviceSignatureVerification(conversationId, identityId, deviceId);
        }
        setVerifiedDeviceIds((prev) => ({ ...prev, [deviceId]: checked }));
        onVerificationChange?.();
      } catch {
        toastError(t('conversations.memberSecurity.verifyPersistFailed', 'Could not update verification'));
      }
    },
    [conversationId, identityId, onVerificationChange, toastError, t],
  );

  const copyFingerprint = useCallback(
    (text: string) => {
      void navigator.clipboard.writeText(text).then(
        () => {
          toastSuccess(t('conversations.memberSecurity.copied', 'Signature copied'));
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
                {isSelfSubject
                  ? t('conversations.memberSecurity.titleSelf', 'Your device signatures')
                  : t('conversations.memberSecurity.title', { name: subjectLabel })}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body member-security-modal-body">
              {loading && (
                <p className="member-security-modal-status">{t('common.loading')}</p>
              )}

              {!loading && fetchError && (
                <p className="member-security-modal-error" role="alert">
                  {fetchError}
                </p>
              )}

              {!loading && keys && (
                <>
                  <Dialog.Description className="confirm-dialog-description member-security-modal-summary">
                    {isSelfSubject
                      ? t('conversations.memberSecurity.summarySelf')
                      : t('conversations.memberSecurity.summary', { name: subjectLabel })}
                  </Dialog.Description>

                  <AccordionRoot className="member-security-modal-accordion" collapsible defaultValue={[]}>
                    <AccordionItem className="member-security-modal-accordion-item" value="explainer">
                      <AccordionItemTrigger className="member-security-modal-accordion-trigger" type="button">
                        <span>{t('conversations.memberSecurity.accordionTitle')}</span>
                        <AccordionItemIndicator className="member-security-modal-accordion-indicator">
                          <Icon name="chevronDown" />
                        </AccordionItemIndicator>
                      </AccordionItemTrigger>
                      <AccordionItemContent className="member-security-modal-accordion-content">
                        <div className="member-security-modal-education">
                          <p>
                            {isSelfSubject
                              ? t('conversations.memberSecurity.introP1Self')
                              : t('conversations.memberSecurity.introP1')}
                          </p>
                          <p>
                            {isSelfSubject
                              ? t('conversations.memberSecurity.introP2Self')
                              : t('conversations.memberSecurity.introP2', { name: subjectLabel })}
                          </p>
                          <p>
                            {isSelfSubject
                              ? t('conversations.memberSecurity.introP3Self')
                              : t('conversations.memberSecurity.introP3', { name: subjectLabel })}
                          </p>
                          <p>
                            {isSelfSubject
                              ? t('conversations.memberSecurity.introP4Self')
                              : t('conversations.memberSecurity.introP4')}
                          </p>
                        </div>
                      </AccordionItemContent>
                    </AccordionItem>
                  </AccordionRoot>

                  {deviceRows.length === 0 ? (
                    <p className="member-security-modal-status">
                      {isSelfSubject
                        ? t('conversations.memberSecurity.noDevicesSelf')
                        : t('conversations.memberSecurity.noDevices')}
                    </p>
                  ) : (
                    <>
                      <h3 className="member-security-modal-subheading">
                        {t('conversations.memberSecurity.devicesHeading')}
                      </h3>
                      <p className="member-security-modal-device-list-blurb">
                        {isSelfSubject
                          ? t('conversations.memberSecurity.deviceListBlurbSelf')
                          : t('conversations.memberSecurity.deviceListBlurb', { name: subjectLabel })}
                      </p>

                      <ul className="member-security-modal-device-list">
                        {deviceRows.map((row) => (
                          <li key={row.deviceId} className="member-security-modal-device">
                            <div className="member-security-modal-device-header">
                              <span className="member-security-modal-device-name">
                                {t('conversations.memberSecurity.deviceOrdinal', { n: row.ordinal })}
                              </span>
                              <span className="member-security-modal-device-id-label">
                                {t('conversations.memberSecurity.deviceIdCaption')}
                              </span>
                              <span className="member-security-modal-device-id">
                                {abbreviateDeviceId(row.deviceId)}
                              </span>
                            </div>
                            {row.kind === 'ok' && (
                              <>
                                <p className="member-security-modal-code-caption">
                                  {t('conversations.memberSecurity.codeCaption')}
                                </p>
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
                                {conversationId && (
                                  <div className="member-security-modal-verify-row">
                                    <Switch.Root
                                      className="member-security-modal-verify-switch"
                                      checked={!!verifiedDeviceIds[row.deviceId]}
                                      disabled={verificationLoading}
                                      onCheckedChange={(details) => {
                                        void handleVerifiedChange(row.deviceId, row.display, details.checked);
                                      }}
                                    >
                                      <Switch.Label className="member-security-modal-verify-label">
                                        {t('conversations.memberSecurity.markVerified', 'Verified')}
                                      </Switch.Label>
                                      <Switch.Control className="member-security-modal-verify-control">
                                        <Switch.Thumb className="member-security-modal-verify-thumb" />
                                      </Switch.Control>
                                      <Switch.HiddenInput />
                                    </Switch.Root>
                                  </div>
                                )}
                              </>
                            )}
                            {row.kind === 'noSpk' && (
                              <p className="member-security-modal-device-unavailable">
                                {t('conversations.memberSecurity.spkUnavailable')}
                              </p>
                            )}
                            {row.kind === 'verifyFailed' && (
                              <p className="member-security-modal-device-unavailable">
                                {t('conversations.memberSecurity.verifyFailed')}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
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
