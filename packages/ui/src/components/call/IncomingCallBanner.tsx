/**
 * Banner shown when an incoming call is received in a conversation.
 * Allows the user to accept or decline the call.
 */

import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';

export interface IncomingCallBannerProps {
  callerName: string;
  callerAvatarUrl?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  hasScreenshare: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function IncomingCallBanner({
  callerName,
  hasAudio,
  hasVideo,
  onAccept,
  onDecline,
}: IncomingCallBannerProps) {
  const { t } = useTranslation();

  const callTypeLabel = hasVideo
    ? t('call.incomingVideo', 'Video call')
    : hasAudio
      ? t('call.incomingAudio', 'Audio call')
      : t('call.incoming', 'Call');

  return (
    <div className="incoming-call-banner">
      <div className="incoming-call-info">
        <Icon name="phoneIncoming" className="incoming-call-icon" />
        <div className="incoming-call-details">
          <span className="incoming-call-caller">{callerName}</span>
          <span className="incoming-call-type">{callTypeLabel}</span>
        </div>
      </div>
      <div className="incoming-call-actions">
        <Button
          variant="ghost"
          size="sm"
          className="incoming-call-decline"
          onClick={onDecline}
          title={t('call.decline', 'Decline')}
        >
          <Icon name="phoneHangup" />
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="incoming-call-accept"
          onClick={onAccept}
          title={t('call.accept', 'Accept')}
        >
          <Icon name="phone" />
          <span>{t('call.accept', 'Accept')}</span>
        </Button>
      </div>
    </div>
  );
}
