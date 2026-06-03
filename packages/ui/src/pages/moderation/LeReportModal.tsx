import { useState } from 'react';
import { Dialog, Portal } from '@ark-ui/react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import type { LeReportCategory } from '@adieuu/shared';

export interface LeReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (category: LeReportCategory, notes?: string) => Promise<void>;
  loading: boolean;
  defaultCategory?: LeReportCategory;
}

export function LeReportModal({
  open,
  onOpenChange,
  onSubmit,
  loading,
  defaultCategory = 'csam',
}: LeReportModalProps) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<LeReportCategory>(defaultCategory);
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    await onSubmit(category, notes.trim() || undefined);
    setNotes('');
  };

  const handleCancel = () => {
    if (!loading) {
      setNotes('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => onOpenChange(e.open)}
      closeOnInteractOutside={!loading}
    >
      <Portal>
        <Dialog.Backdrop className="confirm-dialog-backdrop" />
        <Dialog.Positioner className="confirm-dialog-positioner">
          <Dialog.Content className="confirm-dialog-content confirm-dialog-danger">
            <div className="confirm-dialog-header">
              <Dialog.Title className="confirm-dialog-title">
                {t('moderation.detail.leReportTitle')}
              </Dialog.Title>
            </div>

            <div className="confirm-dialog-body">
              <Dialog.Description className="confirm-dialog-description">
                {t('moderation.detail.leReportDescription')}
              </Dialog.Description>

              <div className="le-report-form">
                <label>
                  {t('moderation.detail.leReportCategory')}
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as LeReportCategory)}
                    disabled={loading}
                  >
                    <option value="csam">
                      {t('moderation.detail.leReportCategoryCsam')}
                    </option>
                  </select>
                </label>

                <label>
                  {t('moderation.detail.leReportNotes')}
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 1000))}
                    placeholder={t('moderation.detail.leReportNotesPlaceholder')}
                    disabled={loading}
                    rows={4}
                  />
                </label>
              </div>
            </div>

            <div className="confirm-dialog-footer">
              <Button
                variant="secondary"
                onClick={handleCancel}
                disabled={loading}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                className="btn-danger"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <span className="confirm-dialog-loading">
                    <LoadingSpinner />
                    {t('moderation.detail.leReportSubmit')}
                  </span>
                ) : (
                  t('moderation.detail.leReportSubmit')
                )}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

function LoadingSpinner() {
  return (
    <svg
      className="confirm-dialog-spinner"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  );
}
