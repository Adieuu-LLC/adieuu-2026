/**
 * Reusable block/unblock button with confirmation dialog and toast feedback.
 *
 * Reads from the global BlockContext to determine current state and
 * perform the block/unblock action. Suitable for use in profile views,
 * hover cards, and any user-action surface.
 */

import { useState, useCallback, useMemo, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlockContext } from '../hooks/useBlockContext';
import { useHoverCardLock, useHoverCardDialogOutlet } from './HoverCard';
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
  const hoverLock = useHoverCardLock();
  const dialogOutlet = useHoverCardDialogOutlet();
  const toast = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const blocked = isBlocked(identityId);

  const openConfirm = useCallback(() => {
    setConfirmOpen(true);
    hoverLock?.lockOpen();
  }, [hoverLock]);

  const handleConfirmOpenChange = useCallback(
    (open: boolean) => {
      setConfirmOpen(open);
      if (!open) hoverLock?.unlockOpen();
    },
    [hoverLock],
  );

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
      handleConfirmOpenChange(false);
    }
  }, [blocked, block, unblock, identityId, toast, t, handleConfirmOpenChange]);

  const dialog = useMemo(
    () => (
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={handleConfirmOpenChange}
        title={blocked ? t('blocked.unblock') : t('blocked.blockUser')}
        description={blocked ? t('blocked.confirmUnblock') : t('blocked.confirmBlock')}
        confirmLabel={blocked ? t('blocked.unblock') : t('blocked.blockUser')}
        variant="danger"
        loading={loading}
        onConfirm={handleConfirm}
      />
    ),
    [confirmOpen, handleConfirmOpenChange, blocked, loading, handleConfirm, t],
  );

  // When inside a HoverCard, push the dialog to the outlet so it renders
  // outside the Ark HoverCard tree (avoids dismiss cascade).
  useLayoutEffect(() => {
    if (!dialogOutlet) return;
    dialogOutlet(dialog);
    return () => dialogOutlet(null);
  }, [dialogOutlet, dialog]);

  return (
    <>
      <Button
        variant={blocked ? 'secondary' : variant}
        size={size}
        onClick={openConfirm}
      >
        {!hideIcon && <Icon name="ban" />}
        {blocked ? t('blocked.unblock') : t('blocked.blockUser')}
      </Button>

      {!dialogOutlet && dialog}
    </>
  );
}
