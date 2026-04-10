/**
 * Reusable block/unblock button that delegates confirmation to the
 * global BlockProvider dialog. Suitable for use in profile views,
 * hover cards, and any user-action surface.
 */

import { useTranslation } from 'react-i18next';
import { useBlockContext } from '../hooks/useBlockContext';
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
  const { isBlocked, requestBlockConfirm } = useBlockContext();

  const blocked = isBlocked(identityId);

  return (
    <Button
      variant={blocked ? 'secondary' : variant}
      size={size}
      onClick={() => requestBlockConfirm(identityId)}
    >
      {!hideIcon && <Icon name="ban" />}
      {blocked ? t('blocked.unblock') : t('blocked.blockUser')}
    </Button>
  );
}
