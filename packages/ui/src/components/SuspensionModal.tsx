import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';
import { Icon } from '../icons/Icon';
import type { SuspensionInfo } from '../hooks/useIdentity';

interface SuspensionModalProps {
  info: SuspensionInfo;
  onDismiss: () => void;
}

export function SuspensionModal({ info, onDismiss }: SuspensionModalProps) {
  const { t } = useTranslation();

  const isBanned = info.type === 'banned';
  const title = isBanned
    ? t('identity.suspension.bannedTitle')
    : t('identity.suspension.suspendedTitle');

  const formattedExpiry = info.suspendedUntil
    ? new Date(info.suspendedUntil).toLocaleString()
    : undefined;

  return (
    <Dialog.Root open closeOnInteractOutside={false} onEscapeKeyDown={(e) => e.preventDefault()}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content confirm-dialog-danger suspension-modal">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title suspension-modal-title">
                <Icon name="warning" className="suspension-modal-icon" />
                {title}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body suspension-modal-body">
              {info.reason && (
                <div className="suspension-modal-field">
                  <span className="suspension-modal-label">{t('identity.suspension.reason')}</span>
                  <span className="suspension-modal-value">{info.reason}</span>
                </div>
              )}

              {info.reportId && (
                <div className="suspension-modal-field">
                  <span className="suspension-modal-label">{t('identity.suspension.reportId')}</span>
                  <code className="suspension-modal-code">{info.reportId}</code>
                </div>
              )}

              {!isBanned && formattedExpiry && (
                <div className="suspension-modal-field">
                  <span className="suspension-modal-label">{t('identity.suspension.suspendedUntil')}</span>
                  <span className="suspension-modal-value">{formattedExpiry}</span>
                </div>
              )}

              <p className="suspension-modal-appeal">
                {t('identity.suspension.appealMessage')}{' '}
                <a href="mailto:disputes@adieuu.com" className="suspension-modal-email">
                  {t('identity.suspension.appealEmail')}
                </a>{' '}
                {t('identity.suspension.appealInstructions')}
              </p>
            </div>

            <div className="confirm-dialog-footer">
              <Button variant="primary" onClick={onDismiss}>
                {t('identity.suspension.dismiss')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
