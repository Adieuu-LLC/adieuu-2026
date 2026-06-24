import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, Portal, Checkbox } from '@ark-ui/react';
import { Trans, useTranslation } from 'react-i18next';
import { Button } from './Button';
import { getLegalPolicyPath } from '../legal/policies';

interface FeedbackSubmitConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function FeedbackSubmitConfirmationModal({
  open,
  onOpenChange,
  onConfirm,
  loading = false,
}: FeedbackSubmitConfirmationModalProps) {
  const { t } = useTranslation();
  const [publicVisible, setPublicVisible] = useState(false);
  const [legalAgreed, setLegalAgreed] = useState(false);

  const canConfirm = publicVisible && legalAgreed && !loading;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setPublicVisible(false);
      setLegalAgreed(false);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(e) => handleOpenChange(e.open)} closeOnInteractOutside={!loading}>
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('feedback.confirm.title')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                {t('feedback.confirm.description')}
              </Dialog.Description>

              <div className="feedback-confirm-checkboxes">
                <Checkbox.Root
                  checked={publicVisible}
                  onCheckedChange={(e) => setPublicVisible(e.checked === true)}
                  className="feedback-confirm-checkbox"
                >
                  <Checkbox.Control className="fs-checkbox-control" />
                  <Checkbox.Label className="fs-checkbox-label">
                    <span className="fs-checkbox-title">{t('feedback.confirm.publicVisible')}</span>
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>

                <Checkbox.Root
                  checked={legalAgreed}
                  onCheckedChange={(e) => setLegalAgreed(e.checked === true)}
                  className="feedback-confirm-checkbox"
                >
                  <Checkbox.Control className="fs-checkbox-control" />
                  <Checkbox.Label className="fs-checkbox-label">
                    <span className="fs-checkbox-title">
                      <Trans
                        i18nKey="feedback.confirm.legalAgreement"
                        components={{
                          tosLink: (
                            <Link
                              to={getLegalPolicyPath('tos')}
                              className="legal-agreement-link"
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          ),
                        }}
                      />
                    </span>
                  </Checkbox.Label>
                  <Checkbox.HiddenInput />
                </Checkbox.Root>
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={() => handleOpenChange(false)}
                disabled={loading}
              >
                {t('common.cancel')}
              </Button>
              <Button variant="primary" onClick={onConfirm} disabled={!canConfirm}>
                {loading ? t('common.loading') : t('feedback.confirm.submit')}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
