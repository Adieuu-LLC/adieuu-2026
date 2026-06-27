/**
 * Web Device Choice Modal
 *
 * Shown during first web login when no cached device keys exist and the
 * shared web device has not been activated yet. Lets the user choose
 * between a recoverable shared web device or a per-session individual device.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, Portal, RadioGroup } from '@ark-ui/react';
import { Button } from './Button';
import type { WebDeviceChoice } from '../hooks/useIdentity';

export interface WebDeviceChoiceModalProps {
  open: boolean;
  onChoice: (choice: WebDeviceChoice) => void;
}

export function WebDeviceChoiceModal({ open, onChoice }: WebDeviceChoiceModalProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<WebDeviceChoice>('shared');

  useEffect(() => {
    if (open) setSelected('shared');
  }, [open]);

  return (
    <Dialog.Root
      open={open}
      closeOnInteractOutside={false}
      closeOnEscape={false}
      onEscapeKeyDown={(e) => e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop web-device-choice-layer-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner web-device-choice-layer-positioner">
          <Dialog.Content className="confirm-dialog-content" style={{ maxWidth: '460px' }}>
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('identity.e2e.webDeviceChoice.title')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <RadioGroup.Root
                value={selected}
                onValueChange={(details) => {
                  const v = details.value;
                  if (v === 'shared' || v === 'individual') setSelected(v);
                }}
                className="activity-radio-group"
              >
                <RadioGroup.Item value="shared" className="activity-radio-item">
                  <RadioGroup.ItemControl className="activity-radio-control" />
                  <RadioGroup.ItemText className="activity-radio-text">
                    <span className="activity-radio-title">
                      {t('identity.e2e.webDeviceChoice.sharedTitle')}
                    </span>
                    <span className="activity-radio-description">
                      {t('identity.e2e.webDeviceChoice.sharedDescription')}
                    </span>
                  </RadioGroup.ItemText>
                  <RadioGroup.ItemHiddenInput />
                </RadioGroup.Item>

                <RadioGroup.Item value="individual" className="activity-radio-item">
                  <RadioGroup.ItemControl className="activity-radio-control" />
                  <RadioGroup.ItemText className="activity-radio-text">
                    <span className="activity-radio-title">
                      {t('identity.e2e.webDeviceChoice.individualTitle')}
                    </span>
                    <span className="activity-radio-description">
                      {t('identity.e2e.webDeviceChoice.individualDescription')}
                    </span>
                  </RadioGroup.ItemText>
                  <RadioGroup.ItemHiddenInput />
                </RadioGroup.Item>
              </RadioGroup.Root>
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
