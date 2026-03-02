/**
 * Web Device Choice Modal
 *
 * Shown during first web login when no cached device keys exist and the
 * shared web device has not been activated yet. Lets the user choose
 * between a recoverable shared web device or a per-session individual device.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal } from '@ark-ui/react';
import { Button } from './Button';
import type { WebDeviceChoice } from '../hooks/useIdentity';

export interface WebDeviceChoiceModalProps {
  open: boolean;
  onChoice: (choice: WebDeviceChoice) => void;
}

export function WebDeviceChoiceModal({ open, onChoice }: WebDeviceChoiceModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<WebDeviceChoice>('shared');

  return (
    <Dialog.Root open={open} closeOnInteractOutside={false} onEscapeKeyDown={(e) => e.preventDefault()}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content" style={{ maxWidth: '460px' }}>
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.e2e.webDeviceChoice.title')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <div className="web-device-choice-options">
                <label className={`web-device-choice-option ${selected === 'shared' ? 'web-device-choice-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="webDeviceChoice"
                    value="shared"
                    checked={selected === 'shared'}
                    onChange={() => setSelected('shared')}
                  />
                  <div>
                    <div className="web-device-choice-option-title">
                      {t('identity.e2e.webDeviceChoice.sharedTitle')}
                    </div>
                    <div className="web-device-choice-option-desc">
                      {t('identity.e2e.webDeviceChoice.sharedDescription')}
                    </div>
                  </div>
                </label>

                <label className={`web-device-choice-option ${selected === 'individual' ? 'web-device-choice-option--selected' : ''}`}>
                  <input
                    type="radio"
                    name="webDeviceChoice"
                    value="individual"
                    checked={selected === 'individual'}
                    onChange={() => setSelected('individual')}
                  />
                  <div>
                    <div className="web-device-choice-option-title">
                      {t('identity.e2e.webDeviceChoice.individualTitle')}
                    </div>
                    <div className="web-device-choice-option-desc">
                      {t('identity.e2e.webDeviceChoice.individualDescription')}
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button variant="primary" onClick={() => onChoice(selected)}>
                {t('identity.e2e.webDeviceChoice.confirm')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
