import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { IdentityPublicKeys } from '@adieuu/shared';
import { getDeviceSignatureVerification } from '../../services/deviceSignatureVerificationStorage';
import { getSafetyFingerprintDisplayForDevice } from '../../services/safetyFingerprintDisplay';
import { Tooltip } from '../Tooltip';
import { Icon } from '../../icons/Icon';

export interface UseDeviceTrustInput {
  messageId: string;
  fromIdentityId: string;
  body: string;
  deleted: boolean;
  senderDeviceId?: string;
  signatureVerified?: boolean;
  fsDowngraded?: boolean;
  peerPublicKeysById: Record<string, IdentityPublicKeys>;
  verificationRevision: number;
  onDeviceTrustMismatch?: (identityId: string, deviceId: string) => void;
}

export interface UseDeviceTrustResult {
  deviceSignatureTrustIcon: React.ReactNode;
  signatureWarningIcon: React.ReactNode;
  fsDowngradeIcon: React.ReactNode;
}

export function useDeviceTrust({
  messageId,
  fromIdentityId,
  body,
  deleted,
  senderDeviceId,
  signatureVerified,
  fsDowngraded,
  peerPublicKeysById,
  verificationRevision,
  onDeviceTrustMismatch,
}: UseDeviceTrustInput): UseDeviceTrustResult {
  const { t } = useTranslation();
  const [deviceSignatureTrust, setDeviceSignatureTrust] = useState<'none' | 'match' | 'mismatch'>('none');

  const peerKeysForSender = peerPublicKeysById[fromIdentityId];

  useEffect(() => {
    let cancelled = false;
    setDeviceSignatureTrust('none');
    async function run() {
      if (deleted || !body) {
        return;
      }
      if (!senderDeviceId) {
        return;
      }
      if (!peerKeysForSender) {
        return;
      }
      let rec: Awaited<ReturnType<typeof getDeviceSignatureVerification>>;
      try {
        rec = await getDeviceSignatureVerification(fromIdentityId, senderDeviceId);
      } catch {
        if (!cancelled) setDeviceSignatureTrust('none');
        return;
      }
      if (cancelled) return;
      if (!rec) {
        return;
      }
      let current: string | null;
      try {
        current = getSafetyFingerprintDisplayForDevice(peerKeysForSender, senderDeviceId);
      } catch {
        if (!cancelled) setDeviceSignatureTrust('none');
        return;
      }
      if (current == null) {
        return;
      }
      const trust = current === rec.verifiedDisplay ? 'match' : 'mismatch';
      setDeviceSignatureTrust(trust);
      if (trust === 'mismatch') {
        onDeviceTrustMismatch?.(fromIdentityId, senderDeviceId);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    deleted,
    body,
    fromIdentityId,
    messageId,
    senderDeviceId,
    peerKeysForSender,
    verificationRevision,
    onDeviceTrustMismatch,
  ]);

  const deviceSignatureTrustIcon =
    deviceSignatureTrust === 'match' ? (
      <Tooltip
        content={t(
          'conversations.memberSecurity.fingerprintMatchIndicator',
          "This message came from a device you verified.",
        )}
        position="top"
      >
        <span
          className="dm-message-signature-trust dm-message-signature-trust--ok"
          role="img"
          aria-label={t(
            'conversations.memberSecurity.fingerprintMatchIndicator',
            'This message came from a device you verified.',
          )}
        >
          <Icon name="key" size="sm" />
        </span>
      </Tooltip>
    ) : deviceSignatureTrust === 'mismatch' ? (
      <Tooltip
        content={t(
          'conversations.memberSecurity.fingerprintMismatchIndicator',
          'Verified fingerprint no longer matches this device. Keys may have changed.',
        )}
        position="top"
      >
        <span
          className="dm-message-signature-trust dm-message-signature-trust--bad"
          role="img"
          aria-label={t(
            'conversations.memberSecurity.fingerprintMismatchIndicator',
            'Verified fingerprint no longer matches this device. Keys may have changed.',
          )}
        >
          <Icon name="error" size="sm" />
        </span>
      </Tooltip>
    ) : null;

  const showSignatureWarning =
    !deleted && !!body && signatureVerified === false;

  const signatureWarningIcon = showSignatureWarning ? (
    <Tooltip
      content={t(
        'conversations.signatureInvalidIndicator',
        'Signature verification failed. This message may not have been sent by the displayed sender, or may have been moved from another conversation.',
      )}
      position="top"
    >
      <span
        className="dm-message-signature-trust dm-message-signature-trust--bad"
        role="img"
        aria-label={t(
          'conversations.signatureInvalidIndicator',
          'Signature verification failed. This message may not have been sent by the displayed sender, or may have been moved from another conversation.',
        )}
      >
        <Icon name="error" size="sm" />
      </span>
    </Tooltip>
  ) : null;

  const fsDowngradeIcon = fsDowngraded === true ? (
    <Tooltip
      content={t(
        'conversations.fsDowngradedIndicator',
        'Forward secrecy could not be applied for every recipient device; some received this message with static keys.',
      )}
      position="top"
    >
      <span className="dm-message-fs-indicator dm-message-fs-indicator--downgraded">
        {t('conversations.fsDowngradedLabel', 'FS partial')}
      </span>
    </Tooltip>
  ) : null;

  return { deviceSignatureTrustIcon, signatureWarningIcon, fsDowngradeIcon };
}
