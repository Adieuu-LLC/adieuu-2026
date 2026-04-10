/**
 * Reusable block/unblock button with confirmation dialog and toast feedback.
 *
 * Reads from the global BlockContext to determine current state and
 * perform the block/unblock action. Suitable for use in profile views,
 * hover cards, and any user-action surface.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlockContext } from '../hooks/useBlockContext';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './Button';
import { Icon } from '../icons/Icon';

export interface BlockActionButtonProps {
  identityId: string;
  /** Button size (default: "sm") */
  size?: 'sm' | 'md' | 'lg';
  /** Button variant when showing "Block" (default: "ghost") */
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Hide the icon */
  hideIcon?: boolean;
}

export function BlockActionButton({
  identityId,
  size = 'sm',
  variant = 'ghost',
  hideIcon = false,
}: BlockActionButtonProps) {
  const { t } = useTranslation();
  const { isBlocked, block, unblock } = useBlockContext();
  const toast = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const blocked = isBlocked(identityId);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      if (blocked) {
        const result = await unblock(identityId);
        if (result.success) {
          toast.success(t('blocked.userUnblocked'));
        } else {
          toast.error(result.error ?? t('blocked.unblock'));
        }
      } else {
        const result = await block(identityId);
        if (result.success) {
          toast.success(t('blocked.userBlocked'));
        } else {
          toast.error(result.error ?? t('blocked.blockUser'));
        }
      }
    } finally {
      setLoading(false);
      setConfirmOpen(false);
    }
  }, [blocked, block, unblock, identityId, toast, t]);

  return (
    <>
      <Button
        variant={blocked ? 'secondary' : variant}
        size={size}
        onClick={() => setConfirmOpen(true)}
      >
        {!hideIcon && <Icon name="ban" />}
        {blocked ? t('blocked.unblock') : t('blocked.blockUser')}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={blocked ? t('blocked.unblock') : t('blocked.blockUser')}
        description={blocked ? t('blocked.confirmUnblock') : t('blocked.confirmBlock')}
        confirmLabel={blocked ? t('blocked.unblock') : t('blocked.blockUser')}
        variant="danger"
        loading={loading}
        onConfirm={handleConfirm}
      />
    </>
  );
}
