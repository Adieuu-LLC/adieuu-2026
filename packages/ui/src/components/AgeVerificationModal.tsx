/**
 * Age verification modal.
 *
 * Explains why verification is needed, initiates the flow, and polls
 * for completion. Displays per-method attempt breakdown via the age_gate.
 * Uses ArkUI Dialog + Portal pattern.
 */

import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from '../i18n';
import { Button } from './Button';
import { useAgeVerification, type AgeVerificationUIStatus } from '../hooks/useAgeVerification';
import { Spinner } from './Spinner';

export interface AgeVerificationModalProps {
  open: boolean;
  onClose: () => void;
  jurisdiction?: string;
  retryAfter?: string;
  expirationCount?: number;
  gateCode?: string;
}

export function AgeVerificationModal({
  open,
  onClose,
  jurisdiction,
  retryAfter,
  expirationCount,
  gateCode,
}: AgeVerificationModalProps) {
  const { t } = useTranslation();
  const av = useAgeVerification();

  const isCooldown = gateCode === 'AGE_VERIFICATION_COOLDOWN' || gateCode === 'AGE_VERIFICATION_FAILED';
  const retryDate = retryAfter ? new Date(retryAfter) : null;
  const canRetry = retryDate ? Date.now() >= retryDate.getTime() : true;

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) { av.cancel(); onClose(); } }}>
      <Portal>
        <Dialog.Backdrop className="av-modal-backdrop" />
        <Dialog.Positioner className="av-modal-positioner">
          <Dialog.Content className="av-modal-content">
            <div className="av-modal-header">
              <Dialog.Title className="av-modal-title">
                {t('compliance.ageVerification.title')}
              </Dialog.Title>
            </div>

            <div className="av-modal-body">
              {renderBody(av, t, {
                jurisdiction,
                retryDate,
                canRetry,
                isCooldown,
                gateCode,
                expirationCount,
              })}
            </div>

            <div className="av-modal-footer">
              {av.status === 'idle' && !isCooldown && (
                <Button variant="primary" onClick={av.start}>
                  {t('compliance.ageVerification.startButton')}
                </Button>
              )}
              {av.status === 'idle' && isCooldown && canRetry && (
                <Button variant="primary" onClick={av.start}>
                  {t('compliance.ageVerification.retryButton')}
                </Button>
              )}
              <Button variant="secondary" onClick={() => { av.cancel(); onClose(); }}>
                {t('compliance.ageVerification.close')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function renderBody(
  av: ReturnType<typeof useAgeVerification>,
  t: ReturnType<typeof useTranslation>['t'],
  opts: {
    jurisdiction?: string;
    retryDate: Date | null;
    canRetry: boolean;
    isCooldown: boolean;
    gateCode?: string;
    expirationCount?: number;
  },
) {
  if (av.status === 'approved') {
    return (
      <div className="av-modal-status av-modal-success">
        <p>{t('compliance.ageVerification.approved')}</p>
      </div>
    );
  }

  if (av.status === 'failed') {
    return (
      <div className="av-modal-status av-modal-error">
        <p>{t('compliance.ageVerification.failedMessage')}</p>
        {opts.retryDate && (
          <p className="av-modal-retry-after">
            {t('compliance.ageVerification.retryAfterLabel')}: {opts.retryDate.toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  if (av.status === 'expired') {
    return (
      <div className="av-modal-status av-modal-warning">
        <p>{t('compliance.ageVerification.expiredMessage')}</p>
        {opts.expirationCount !== undefined && (
          <p className="av-modal-attempts">
            {t('compliance.ageVerification.expirationCount', {
              count: opts.expirationCount,
              max: 3,
            })}
          </p>
        )}
      </div>
    );
  }

  if (av.status === 'starting') {
    return (
      <div className="av-modal-status av-modal-loading">
        <Spinner size="md" />
        <p>{t('compliance.ageVerification.starting')}</p>
      </div>
    );
  }

  if (av.status === 'awaiting_user' || av.status === 'polling') {
    return (
      <div className="av-modal-status av-modal-pending">
        <Spinner size="md" />
        <p>
          {av.status === 'awaiting_user'
            ? t('compliance.ageVerification.awaitingUser')
            : t('compliance.ageVerification.processing')}
        </p>
        {av.ageGate && (
          <div className="av-modal-age-gate">
            <h4>{t('compliance.ageVerification.methodsTitle')}</h4>
            <ul className="av-modal-methods-list">
              {Object.entries(av.ageGate).map(([method, info]) =>
                info.enabled ? (
                  <li key={method} className="av-modal-method-item">
                    <span className="av-modal-method-name">{method}</span>
                    <span className="av-modal-method-remaining">
                      {t('compliance.ageVerification.attemptsRemaining', {
                        remaining: info.remaining,
                      })}
                    </span>
                  </li>
                ) : null,
              )}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Idle state
  if (opts.isCooldown && !opts.canRetry) {
    return (
      <div className="av-modal-status av-modal-cooldown">
        <p>
          {opts.gateCode === 'AGE_VERIFICATION_FAILED'
            ? t('compliance.ageVerification.failedMessage')
            : t('compliance.ageVerification.cooldownMessage')}
        </p>
        {opts.retryDate && (
          <p className="av-modal-retry-after">
            {t('compliance.ageVerification.retryAfterLabel')}: {opts.retryDate.toLocaleDateString()}
          </p>
        )}
      </div>
    );
  }

  return (
    <Dialog.Description className="av-modal-description">
      {t('compliance.ageVerification.description')}
      {opts.jurisdiction && (
        <span className="av-modal-jurisdiction">
          {' '}({opts.jurisdiction})
        </span>
      )}
    </Dialog.Description>
  );
}
