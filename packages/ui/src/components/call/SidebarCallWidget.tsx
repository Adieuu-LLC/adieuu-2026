/**
 * Sidebar call widget.
 *
 * Displayed in the sidebar footer area (above the identity/account flyouts).
 * Modes:
 * A) Active conversation call: name + duration + media controls, click to navigate.
 * B) Active Space voice channel: channel name + status + media controls.
 * C) Incoming conversation call: name + accept/decline.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { Icon } from '../../icons/Icon';
import { useCallSession } from '../../hooks/useCallSession';
import { useGlobalCallEvents } from '../../hooks/useGlobalCallEvents';
import { useConversations } from '../../hooks/useConversations';
import {
  useOptionalVoiceChannelSession,
  useVoiceChannelSession,
} from '../../hooks/useVoiceChannelSession';
import { useSpaces } from '../../hooks/useSpaces';
import { useSpaceCipher } from '../../pages/spaces/useSpaceCipher';
import { resolveChannelDisplayName } from '../../pages/spaces/spaceMetadataCipher';
import { CallControlsRow } from './CallControlsRow';

export function SidebarCallWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeSession, phase, requestJoinCall, leaveCall } = useCallSession();
  const { incomingCalls, dismissIncoming } = useGlobalCallEvents();
  const { conversations, activeConversationId } = useConversations();
  const voice = useOptionalVoiceChannelSession();

  const inCall = activeSession !== null && phase === 'active';
  const voiceJoined = voice?.joined ?? null;
  const topIncoming = incomingCalls[0] ?? null;

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

  if (voiceJoined) {
    return <VoiceActiveWidget />;
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

function useElapsed(resetKey: string): string {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsed(0);
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [resetKey]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function CallWidgetEndActions({
  leaveTitle,
  onLeave,
}: {
  leaveTitle: string;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="sidebar-call-widget__actions">
      <Button
        variant="ghost"
        size="sm"
        className="sidebar-call-widget__settings"
        onClick={() => navigate('/identity/audio-video')}
        title={t('identity.audioVideo.title')}
        aria-label={t('identity.audioVideo.title')}
      >
        <Icon name="settings" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="sidebar-call-widget__leave"
        onClick={onLeave}
        title={leaveTitle}
        aria-label={leaveTitle}
      >
        <Icon name="phoneHangup" />
      </Button>
    </div>
  );
}

function ActiveCallWidget({
  conversationId,
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
  const timeDisplay = useElapsed(conversationId);

  return (
    <div className="sidebar-call-widget sidebar-call-widget--active sidebar-call-widget--stacked">
      <div className="sidebar-call-widget__main">
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
        <CallWidgetEndActions leaveTitle={t('call.leave', 'Leave call')} onLeave={onLeave} />
      </div>
      <CallControlsRow className="sidebar-call-widget__controls-row" />
    </div>
  );
}

function VoiceActiveWidget() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { joined, phase, leaveVoiceChannel, setMediaState } = useVoiceChannelSession();
  const { spaces, channels, activeSpace } = useSpaces();
  const { spaceCipher } = useSpaceCipher(activeSpace?.id);

  const channel = useMemo(
    () => (joined ? channels.find((c) => c.id === joined.channelId) : null),
    [channels, joined],
  );
  const space = useMemo(
    () => (joined ? spaces.find((s) => s.id === joined.spaceId) : null),
    [spaces, joined],
  );

  const timeDisplay = useElapsed(joined?.channelId ?? 'voice');

  const handleMediaChange = useCallback(
    (state: { micEnabled: boolean; cameraEnabled: boolean; screenShareEnabled: boolean }) => {
      void setMediaState({
        audio: state.micEnabled,
        video: state.cameraEnabled,
        screenshare: state.screenShareEnabled,
      });
    },
    [setMediaState],
  );

  if (!joined) return null;

  const name = channel
    ? resolveChannelDisplayName(channel, spaceCipher, {
        encryptedChannel: t('spaces.encryptedChannelPlaceholder'),
      })
    : t('spaces.voice.channelFallback', 'Voice channel');

  const isLive = phase === 'live';
  const statusLabel =
    phase === 'live'
      ? timeDisplay
      : phase === 'connecting'
        ? t('spaces.voice.statusConnecting')
        : t('spaces.voice.statusWaiting');

  const canNavigate = !!space;

  return (
    <div className="sidebar-call-widget sidebar-call-widget--active sidebar-call-widget--stacked">
      <div className="sidebar-call-widget__main">
        <button
          type="button"
          className="sidebar-call-widget__info"
          onClick={space ? () => navigate(`/s/${space.slug}/c/${joined.channelId}`) : undefined}
          title={canNavigate ? t('call.returnToCall', 'Return to call') : undefined}
        >
          <Icon name="phone" className="sidebar-call-widget__icon" />
          <div className="sidebar-call-widget__text">
            <span className="sidebar-call-widget__name">{name}</span>
            <span className={isLive ? 'sidebar-call-widget__duration' : 'sidebar-call-widget__status'}>
              {statusLabel}
            </span>
          </div>
        </button>
        <CallWidgetEndActions
          leaveTitle={t('spaces.voice.disconnect')}
          onLeave={() => void leaveVoiceChannel()}
        />
      </div>
      <CallControlsRow
        className="sidebar-call-widget__controls-row"
        onMediaChange={handleMediaChange}
      />
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
