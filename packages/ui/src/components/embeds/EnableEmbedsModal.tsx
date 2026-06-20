/**
 * Modal explaining privacy risks of enabling all embeds.
 * Shown on first interaction with the "Enable all embeds" prompt.
 *
 * @module components/embeds/EnableEmbedsModal
 */

import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';

export interface EnableEmbedsModalProps {
  open: boolean;
  onEnableAll: () => void;
  onClose: () => void;
}

export function EnableEmbedsModal({ open, onEnableAll, onClose }: EnableEmbedsModalProps) {
  const { t } = useTranslation();

  return (
    <Dialog.Root open={open} onOpenChange={(e) => { if (!e.open) onClose(); }}>
      <Portal>
        <Dialog.Backdrop className="enable-embeds-modal-backdrop" />
        <Dialog.Positioner className="enable-embeds-modal-positioner">
          <Dialog.Content className="enable-embeds-modal-content">
            <div className="enable-embeds-modal-header">
              <Dialog.Title className="enable-embeds-modal-title">
                {t('conversations.embeds.enableAllTitle', 'Enable All Embeds')}
              </Dialog.Title>
            </div>

            <div className="enable-embeds-modal-body">
              <Dialog.Description className="enable-embeds-modal-description">
                {t(
                  'conversations.embeds.enableAllDescription',
                  'When embeds are enabled, your browser loads images directly from third-party websites. This means those sites can see your IP address and may use this to track when you view a message containing their link.',
                )}
              </Dialog.Description>

              <p className="enable-embeds-modal-note">
                {t(
                  'conversations.embeds.enableAllNote',
                  'You can change this at any time in your Appearance settings, or choose to allow embeds only from specific domains.',
                )}
              </p>
            </div>

            <div className="enable-embeds-modal-footer">
              <Button variant="secondary" onClick={onClose}>
                {t('conversations.embeds.goBack', 'Go back')}
              </Button>
              <Button variant="primary" onClick={onEnableAll}>
                {t('conversations.embeds.enableAll', 'Enable All Embeds')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
