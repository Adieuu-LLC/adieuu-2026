/**
 * Modal shown when the user's IP is flagged as abusive.
 */

import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from '../i18n';
import { Button } from './Button';

export interface AbusiveIpModalProps {
  open: boolean;
  message?: string;
  onAcknowledge: () => void;
}

export function AbusiveIpModal({ open, message, onAcknowledge }: AbusiveIpModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} closeOnInteractOutside={false} closeOnEscape={false}>
      <Portal>
        <Dialog.Backdrop className="geofence-modal-backdrop" />
        <Dialog.Positioner className="geofence-modal-positioner">
          <Dialog.Content className="geofence-modal-content">
            <Dialog.Title className="geofence-modal-title">
              {t('compliance.abusiveIp.title')}
            </Dialog.Title>
            <Dialog.Description className="geofence-modal-description">
              {message ?? t('compliance.abusiveIp.body')}
            </Dialog.Description>
            <p className="geofence-modal-description">{t('compliance.abusiveIp.vpnHint')}</p>
            <p className="geofence-modal-description">{t('compliance.abusiveIp.logoutNotice')}</p>
            <div className="geofence-modal-footer">
              <Button variant="primary" onClick={onAcknowledge}>
                {t('compliance.abusiveIp.acknowledge')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
