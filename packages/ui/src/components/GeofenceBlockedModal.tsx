/**
 * Modal displayed when the user's jurisdiction is geofence-blocked.
 * Uses ArkUI Dialog + Portal pattern.
 */

import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from '../i18n';
import { Button } from './Button';

export interface GeofenceBlockedModalProps {
  open: boolean;
  onClose: () => void;
  jurisdiction?: string;
  lawUrl?: string;
}

export function GeofenceBlockedModal({ open, onClose, jurisdiction, lawUrl }: GeofenceBlockedModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose(); }} lazyMount>
      <Portal>
        <Dialog.Backdrop className="geofence-modal-backdrop" />
        <Dialog.Positioner className="geofence-modal-positioner">
          <Dialog.Content className="geofence-modal-content">
            <div className="geofence-modal-header">
              <Dialog.Title className="geofence-modal-title">
                {t('compliance.geofence.title')}
              </Dialog.Title>
            </div>
            <div className="geofence-modal-body">
              <Dialog.Description className="geofence-modal-description">
                {t('compliance.geofence.description')}
              </Dialog.Description>
              {jurisdiction && (
                <p className="geofence-modal-jurisdiction">
                  {t('compliance.geofence.jurisdictionLabel')}: <strong>{jurisdiction}</strong>
                </p>
              )}
              {lawUrl && (
                <a
                  href={lawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="geofence-modal-law-link"
                >
                  {t('compliance.geofence.viewLaw')}
                </a>
              )}
            </div>
            <div className="geofence-modal-footer">
              <Button variant="secondary" onClick={onClose}>
                {t('compliance.geofence.close')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
