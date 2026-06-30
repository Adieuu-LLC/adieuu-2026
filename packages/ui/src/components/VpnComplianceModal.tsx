/**
 * Non-dismissable VPN / export-control attestation modal.
 */

import { useCallback, useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from '../i18n';
import { Button } from './Button';
import { createApiClient, type SessionCompliance } from '@adieuu/shared';
import { useAppConfig } from '../config';

export interface VpnComplianceModalProps {
  open: boolean;
  vpnAttestation: NonNullable<SessionCompliance['vpnAttestation']>;
  onComplete: () => Promise<void>;
}

export function VpnComplianceModal({ open, vpnAttestation, onComplete }: VpnComplianceModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = createApiClient({ baseUrl: apiBaseUrl });
  const [submitting, setSubmitting] = useState(false);
  const [localStep, setLocalStep] = useState<'utah_notice' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const step = localStep ?? vpnAttestation.step;

  const finishAttestation = useCallback(async () => {
    try {
      await onComplete();
    } catch {
      setError(t('compliance.vpn.sessionRefreshFailed'));
    }
  }, [onComplete, t]);

  const submitAnswer = useCallback(async (answer: 'yes' | 'no') => {
    setSubmitting(true);
    setError(null);
    try {
      const attestationStep = localStep ? 'utah_residency' : vpnAttestation.step;
      const response = await api.compliance.submitVpnAttestation({
        step: attestationStep,
        answer,
      });

      if (!response.success) {
        if (response.error?.code === 'ACCOUNT_BANNED') {
          try {
            await onComplete();
          } catch {
            // Session may already be cleared after a ban; still close the flow.
          }
          return;
        }
        setError(response.error?.message ?? 'Something went wrong.');
        return;
      }

      if (response.data?.next === 'utah_notice' && answer === 'yes') {
        setLocalStep('utah_notice');
        return;
      }

      await finishAttestation();
    } finally {
      setSubmitting(false);
    }
  }, [api, finishAttestation, localStep, vpnAttestation.step]);

  const continueFromUtahNotice = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await finishAttestation();
    } finally {
      setSubmitting(false);
    }
  }, [finishAttestation]);

  return (
    <Dialog.Root open={open} closeOnInteractOutside={false} closeOnEscape={false} lazyMount>
      <Portal>
        <Dialog.Backdrop className="geofence-modal-backdrop" />
        <Dialog.Positioner className="geofence-modal-positioner">
          <Dialog.Content className="geofence-modal-content">
            {step === 'sanctioned_membership' && (
              <>
                <Dialog.Title className="geofence-modal-title">
                  {t('compliance.vpn.title')}
                </Dialog.Title>
                <Dialog.Description className="geofence-modal-description">
                  {t('compliance.vpn.body')}
                </Dialog.Description>
                <p className="geofence-modal-description">{t('compliance.vpn.vpnHint')}</p>
                <p className="geofence-modal-description">{t('compliance.vpn.sanctionedIntro')}</p>
                <ul className="geofence-modal-jurisdiction" style={{ maxHeight: '12rem', overflowY: 'auto' }}>
                  {vpnAttestation.sanctionedCountries.map((c) => (
                    <li key={c.countryCode}>
                      <strong>{c.countryCode}</strong> — {c.countryName}
                    </li>
                  ))}
                </ul>
                <p className="geofence-modal-description">{t('compliance.vpn.sanctionedQuestion')}</p>
                {error && <p className="geofence-modal-description">{error}</p>}
                <div className="geofence-modal-footer">
                  <Button variant="primary" disabled={submitting} onClick={() => void submitAnswer('yes')}>
                    {t('compliance.vpn.yes')}
                  </Button>
                  <Button variant="secondary" disabled={submitting} onClick={() => void submitAnswer('no')}>
                    {t('compliance.vpn.no')}
                  </Button>
                </div>
              </>
            )}

            {step === 'utah_residency' && (
              <>
                <Dialog.Title className="geofence-modal-title">
                  {t('compliance.vpn.utahQuestion')}
                </Dialog.Title>
                {error && <p className="geofence-modal-description">{error}</p>}
                <div className="geofence-modal-footer">
                  <Button variant="primary" disabled={submitting} onClick={() => void submitAnswer('yes')}>
                    {t('compliance.vpn.yes')}
                  </Button>
                  <Button variant="secondary" disabled={submitting} onClick={() => void submitAnswer('no')}>
                    {t('compliance.vpn.no')}
                  </Button>
                </div>
              </>
            )}

            {step === 'utah_notice' && (
              <>
                <Dialog.Title className="geofence-modal-title">
                  {t('compliance.ageVerification.title')}
                </Dialog.Title>
                <Dialog.Description className="geofence-modal-description">
                  {t('compliance.vpn.utahNotice')}
                </Dialog.Description>
                {error && <p className="geofence-modal-description">{error}</p>}
                <div className="geofence-modal-footer">
                  <Button variant="primary" disabled={submitting} onClick={() => void continueFromUtahNotice()}>
                    {t('compliance.vpn.utahContinue')}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
