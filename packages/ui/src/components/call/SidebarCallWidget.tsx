/**
 * Sidebar call widget.
 *
 * Displayed in the sidebar footer area (above the identity/account flyouts).
 * Two modes:
 * A) Incoming call: shows conversation name + accept/decline
 * B) Active call: shows conversation name + duration, click to navigate back
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';
import { useCallSession } from '../../hooks/useCallSession';
import { useGlobalCallEvents } from '../../hooks/useGlobalCallEvents';
import { useConversations } from '../../hooks/useConversations';

export function SidebarCallWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSession, phase, requestJoinCall, leaveCall } = useCallSession();
  const { incomingCalls, dismissIncoming } = useGlobalCallEvents();
  const { conversations, activeConversationId } = useConversations();

  const inCall = activeSession !== null && phase === 'active';
  const topIncoming = incomingCalls[0] ?? null;

  if (!inCall && !topIncoming) return null;

  if (inCall && activeSession) {
    return (
      <ActiveCallWidget
        conversationId={activeSession.conversationId}
        conversationName={
          conversations.find((c) => c.id === activeSession.conversationId)?.decryptedName
          ?? t('call.unknownConversation', 'Call')
        }
        isViewingCallConversation={activeConversationId === activeSession.conversationId}
        onNavigate={() => navigate(`/conversations/${activeSession.conversationId}`)}
        onLeave={() => void leaveCall()}
      />
    );
  }

  if (topIncoming) {
    return (
      <IncomingCallWidget
        conversationName={topIncoming.conversationName ?? t('call.unknownConversation', 'Call')}
        canAccept={!inCall}
        onAccept={() => {
          dismissIncoming(topIncoming.callId);
          requestJoinCall(
            topIncoming.conversationId,
            topIncoming.callId,
            { audio: true, video: false, screenshare: false },
          );
        }}
        onDecline={() => dismissIncoming(topIncoming.callId)}
      />
    );
  }

  return null;
}

function ActiveCallWidget({
  conversationName,
  isViewingCallConversation,
  onNavigate,
  onLeave,
}: {
  conversationId: string;
  conversationName: string;
  isViewingCallConversation: boolean;
  onNavigate: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="sidebar-call-widget sidebar-call-widget--active">
      <button
        type="button"
        className="sidebar-call-widget__info"
        onClick={isViewingCallConversation ? undefined : onNavigate}
        title={isViewingCallConversation ? undefined : t('call.returnToCall', 'Return to call')}
      >
        <Icon name="phone" className="sidebar-call-widget__icon" />
        <div className="sidebar-call-widget__text">
          <span className="sidebar-call-widget__name">{conversationName}</span>
          <span className="sidebar-call-widget__duration">{timeDisplay}</span>
        </div>
      </button>
      <Button
        variant="ghost"
        size="sm"
        className="sidebar-call-widget__leave"
        onClick={onLeave}
        title={t('call.leave', 'Leave call')}
      >
        <Icon name="phoneHangup" />
      </Button>
    </div>
  );
}

function IncomingCallWidget({
  conversationName,
  canAccept,
  onAccept,
  onDecline,
}: {
  conversationName: string;
  canAccept: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="sidebar-call-widget sidebar-call-widget--incoming">
      <div className="sidebar-call-widget__info">
        <Icon name="phoneIncoming" className="sidebar-call-widget__icon sidebar-call-widget__icon--ringing" />
        <div className="sidebar-call-widget__text">
          <span className="sidebar-call-widget__name">{conversationName}</span>
          <span className="sidebar-call-widget__status">{t('call.incoming', 'Incoming call...')}</span>
        </div>
      </div>
      <div className="sidebar-call-widget__actions">
        <Button
          variant="ghost"
          size="sm"
          className="sidebar-call-widget__decline"
          onClick={onDecline}
          title={t('call.decline', 'Decline')}
        >
          <Icon name="phoneHangup" />
        </Button>
        {canAccept && (
          <Button
            variant="primary"
            size="sm"
            className="sidebar-call-widget__accept"
            onClick={onAccept}
            title={t('call.accept', 'Accept')}
          >
            <Icon name="phone" />
          </Button>
        )}
      </div>
    </div>
  );
}
