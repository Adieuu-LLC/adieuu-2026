/**
 * Full-screen overlay displayed during an active call.
 * Contains the participant grid and call controls.
 */

import { useTranslation } from 'react-i18next';
import { CallControls, type CallControlsProps } from './CallControls';
import { CallParticipantGrid, type CallParticipantInfo } from './CallParticipantGrid';
import { Spinner } from '../Spinner';

export interface CallOverlayProps {
  status: 'ringing' | 'active' | 'connecting';
  participants: CallParticipantInfo[];
  localIdentityId: string;
  controls: CallControlsProps;
  conversationName?: string;
  onMinimize?: () => void;
}

export function CallOverlay({
  status,
  participants,
  localIdentityId,
  controls,
  conversationName,
  onMinimize,
}: CallOverlayProps) {
  const { t } = useTranslation();

  return (
    <div className="call-overlay">
      <div className="call-overlay-header">
        <div className="call-overlay-title">
          {conversationName && (
            <span className="call-overlay-conversation-name">{conversationName}</span>
          )}
          <span className="call-overlay-status">
            {status === 'ringing' && t('call.ringing', 'Ringing...')}
            {status === 'connecting' && t('call.connecting', 'Connecting...')}
            {status === 'active' && t('call.active', 'In call')}
          </span>
        </div>
        {onMinimize && (
          <button
            className="call-overlay-minimize"
            onClick={onMinimize}
            title={t('call.minimize', 'Minimize')}
          >
            <span aria-hidden>&#x2012;</span>
          </button>
        )}
      </div>

      <div className="call-overlay-body">
        {status === 'connecting' ? (
          <div className="call-overlay-connecting">
            <Spinner />
            <p>{t('call.connectingMessage', 'Setting up encrypted connection...')}</p>
          </div>
        ) : (
          <CallParticipantGrid
            participants={participants}
            localIdentityId={localIdentityId}
          />
        )}
      </div>

      <div className="call-overlay-footer">
        <CallControls {...controls} />
      </div>
    </div>
  );
}
