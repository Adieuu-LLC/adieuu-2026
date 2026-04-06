/**
 * ReportModal — two-step (message) or single-step (profile) report dialog.
 *
 * Step 1: Category selection + optional reason.
 * Step 2 (message only): Explicit privacy consent before gathering
 *         session keys and submitting.
 *
 * @module components/ReportModal
 */

import { useState, useMemo } from 'react';
import { Dialog, Portal, Select, createListCollection } from '@ark-ui/react';
import { Button } from './Button';
import { Icon } from '../icons/Icon';
import { useTranslation } from 'react-i18next';
import { createApiClient, type ReportCategory } from '@adieuu/shared';
import { useAppConfig } from '../config';
import { useToast } from './Toast';
import { useReportEvidence } from '../hooks/useReportEvidence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'message' | 'profile';
  /** For message reports: the ID of the message being reported */
  targetMessageId?: string;
  /** For profile reports: the ID of the identity being reported */
  targetIdentityId?: string;
}

const CATEGORIES: { value: ReportCategory; labelKey: string }[] = [
  { value: 'harassment', labelKey: 'report.categories.harassment' },
  { value: 'spam', labelKey: 'report.categories.spam' },
  { value: 'impersonation', labelKey: 'report.categories.impersonation' },
  { value: 'violence', labelKey: 'report.categories.violence' },
  { value: 'csam', labelKey: 'report.categories.csam' },
  { value: 'illegal_content', labelKey: 'report.categories.illegal_content' },
  { value: 'other', labelKey: 'report.categories.other' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportModal({
  open,
  onOpenChange,
  mode,
  targetMessageId,
  targetIdentityId,
}: ReportModalProps) {
  const { t } = useTranslation();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);
  const toast = useToast();
  const { gatherEvidence } = useReportEvidence();

  const categoryCollection = useMemo(
    () =>
      createListCollection({
        items: CATEGORIES.map((c) => ({
          value: c.value,
          label: t(c.labelKey),
        })),
      }),
    [t],
  );

  const [step, setStep] = useState<'form' | 'consent'>('form');
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setStep('form');
    setCategory('');
    setReason('');
    setSubmitting(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleNext = () => {
    if (!category) return;
    if (mode === 'message') {
      setStep('consent');
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!category) return;
    setSubmitting(true);

    try {
      if (mode === 'message' && targetMessageId) {
        const evidence = await gatherEvidence(targetMessageId);

        if (evidence.missingKeys.length > 0) {
          toast.error(
            t('report.title'),
            t('report.errorDecryption'),
          );
          setSubmitting(false);
          return;
        }

        const resp = await api.reports.submitMessageReport({
          type: 'message',
          targetMessageId,
          category,
          reason: reason.trim() || undefined,
          sessionKeys: evidence.sessionKeys,
        });

        if (!resp.data) throw new Error(resp.error?.message ?? 'Unknown error');
      } else if (mode === 'profile' && targetIdentityId) {
        const resp = await api.reports.submitProfileReport({
          type: 'profile',
          targetIdentityId,
          category,
          reason: reason.trim() || undefined,
        });

        if (!resp.data) throw new Error(resp.error?.message ?? 'Unknown error');
      }

      toast.success(t('report.title'), t('report.success'));
      handleClose(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('429') || message.includes('rate')) {
        toast.error(t('report.title'), t('report.errorRateLimit'));
      } else if (message.includes('already')) {
        toast.error(t('report.title'), t('report.errorDuplicate'));
      } else {
        toast.error(t('report.title'), t('report.errorGeneric'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const title = mode === 'message' ? t('report.reportMessage') : t('report.reportProfile');

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => handleClose(e.open)}
      closeOnInteractOutside={!submitting}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content confirm-dialog-warning">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">{title}</Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              {step === 'form' && (
                <>
                  <div className="input-wrapper">
                    <label className="input-label">{t('report.categoryLabel')}</label>
                    <Select.Root
                      collection={categoryCollection}
                      value={category ? [category] : []}
                      onValueChange={(details) => {
                        const next = details.value[0] as ReportCategory | undefined;
                        if (next) setCategory(next);
                      }}
                      positioning={{ sameWidth: true }}
                    >
                      <Select.Control className="report-select-control">
                        <Select.Trigger className="report-select-trigger">
                          <Select.ValueText placeholder={t('report.categoryPlaceholder')} />
                          <Select.Indicator className="report-select-indicator">
                            <Icon name="chevronDown" size="xs" />
                          </Select.Indicator>
                        </Select.Trigger>
                      </Select.Control>

                      <Portal>
                        <Select.Positioner>
                          <Select.Content className="report-select-content">
                            {categoryCollection.items.map((item) => (
                              <Select.Item key={item.value} item={item} className="report-select-item">
                                <Select.ItemText>{item.label}</Select.ItemText>
                                <Select.ItemIndicator className="report-select-item-indicator">
                                  <Icon name="check" size="xs" />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Content>
                        </Select.Positioner>
                      </Portal>
                    </Select.Root>
                  </div>

                  <div className="input-wrapper">
                    <label className="input-label">{t('report.reasonLabel')}</label>
                    <textarea
                      className="input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t('report.reasonPlaceholder')}
                      maxLength={500}
                      rows={3}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </>
              )}

              {step === 'consent' && (
                <>
                  <p className="report-modal-consent-title">{t('report.consentStepTitle')}</p>
                  <p className="report-modal-consent-text">
                    {mode === 'message'
                      ? t('report.messageConsent')
                      : t('report.profileConsent')}
                  </p>
                </>
              )}
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={() => {
                  if (step === 'consent') {
                    setStep('form');
                  } else {
                    handleClose(false);
                  }
                }}
                disabled={submitting}
              >
                {step === 'consent' ? t('report.cancel') : t('report.cancel')}
              </Button>

              {step === 'form' && (
                <Button
                  variant="primary"
                  onClick={handleNext}
                  disabled={!category}
                >
                  {mode === 'message' ? t('report.next') : t('report.submit')}
                </Button>
              )}

              {step === 'consent' && (
                <Button
                  variant="primary"
                  className="btn-danger"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? t('report.submitting') : t('report.submit')}
                </Button>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
