/**
 * Banner displayed at the top of a conversation when there is an active call
 * that the current user is NOT participating in. Allows them to join/rejoin
 * and access troubleshooting for stuck calls.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';
import type { PublicCallParticipant } from '../../hooks/useCall';

export interface ActiveCallBannerProps {
  participantCount: number;
  participants: PublicCallParticipant[];
  /** True when the server thinks we're in the call but we have no local session. */
  isGhostState?: boolean;
  onJoin: () => void;
  onTroubleshoot?: () => void;
}

export function ActiveCallBanner({
  participantCount,
  isGhostState,
  onJoin,
  onTroubleshoot,
}: ActiveCallBannerProps) {
  const { t } = useTranslation();

  return (
    <div className={`active-call-banner${isGhostState ? ' active-call-banner--ghost' : ''}`}>
      <div className="active-call-banner__info">
        <Icon name="phone" className="active-call-banner__icon" />
        <span className="active-call-banner__text">
          {isGhostState
            ? t('call.ghostCallBanner', 'You were disconnected from this call.')
            : participantCount > 0
              ? t('call.activeCallBanner', { count: participantCount })
              : t('call.activeCallBannerEmpty')}
        </span>
      </div>
      <div className="active-call-banner__actions">
        {onTroubleshoot && (
          <button
            type="button"
            className="active-call-banner__troubleshoot"
            onClick={onTroubleshoot}
          >
            {t('call.troubleshootLink')}
          </button>
        )}
        <Button
          variant="primary"
          size="sm"
          className="active-call-banner__join"
          onClick={onJoin}
        >
          <Icon name="phone" />
          <span>{isGhostState ? t('call.rejoinCall', 'Rejoin') : t('call.joinCall')}</span>
        </Button>
      </div>
    </div>
  );
}
