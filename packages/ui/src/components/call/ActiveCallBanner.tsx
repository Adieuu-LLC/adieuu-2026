/**
 * Banner displayed at the top of a conversation when there is an active call
 * that the current user is NOT participating in. Allows them to join/rejoin.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';
import type { PublicCallParticipant } from '../../hooks/useCall';

export interface ActiveCallBannerProps {
  participantCount: number;
  participants: PublicCallParticipant[];
  onJoin: () => void;
}

export function ActiveCallBanner({
  participantCount,
  onJoin,
}: ActiveCallBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="active-call-banner">
      <div className="active-call-banner__info">
        <Icon name="phone" className="active-call-banner__icon" />
        <span className="active-call-banner__text">
          {participantCount > 0
            ? t('call.activeCallBanner', {
                count: participantCount,
                defaultValue: `A call is in progress ({{count}} participant${participantCount === 1 ? '' : 's'})`,
              })
            : t('call.activeCallBannerEmpty', 'A call is in progress')}
        </span>
      </div>
      <Button
        variant="primary"
        size="sm"
        className="active-call-banner__join"
        onClick={onJoin}
      >
        <Icon name="phone" />
        <span>{t('call.joinCall', 'Join')}</span>
      </Button>
    </div>
  );
}
