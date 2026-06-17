import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '../ConfirmDialog';

export interface CallTroubleshootModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onForceEnd: () => Promise<boolean>;
}

export function CallTroubleshootModal({
  open,
  onOpenChange,
  onForceEnd,
}: CallTroubleshootModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const handleForceEnd = useCallback(async () => {
    setLoading(true);
    try {
      const success = await onForceEnd();
      if (success) {
        onOpenChange(false);
      }
    } finally {
      setLoading(false);
    }
  }, [onForceEnd, onOpenChange]);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('call.troubleshootTitle')}
      description={t('call.troubleshootDescription')}
      confirmLabel={t('call.forceEndCall')}
      variant="danger"
      loading={loading}
      onConfirm={handleForceEnd}
    >
      <p className="call-troubleshoot-warning">
        {t('call.forceEndConfirm')}
      </p>
    </ConfirmDialog>
  );
}
