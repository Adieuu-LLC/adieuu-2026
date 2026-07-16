import { useEffect, type MutableRefObject } from 'react';
import type { ChatIncomingMessage, ChatConnectionState, PublicSpace, PublicSpaceMessage } from '@adieuu/shared';
import { handleSpaceSocketMessage, type SpaceChannelUnreadState } from '../../services/spaceSocketHandlers';
import type { SpaceChannelMessagesState, SpacesContextValue } from './types';

export interface SpacesSocketEffectsParams {
  isLoggedIn: boolean;
  subscribe: (handler: (message: ChatIncomingMessage) => void) => () => void;
  onStateChange: (handler: (state: ChatConnectionState) => void) => () => void;
  setSpaces: React.Dispatch<React.SetStateAction<PublicSpace[]>>;
  setMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, SpaceChannelMessagesState>>>;
  activeSpaceIdRef: MutableRefObject<string | null>;
  activeChannelIdRef: MutableRefObject<string | null>;
  identityIdRef: MutableRefObject<string | undefined>;
  refreshSpacesRef: MutableRefObject<() => Promise<void>>;
  refreshChannelMessagesRef: MutableRefObject<(spaceId: string, channelId: string) => void>;
  socketCallbacksRef: MutableRefObject<{
    onReactionAdded?: SpacesContextValue['onSocketReactionAdded'];
    onReactionRemoved?: SpacesContextValue['onSocketReactionRemoved'];
    onPinsUpdated?: SpacesContextValue['onSocketPinsUpdated'];
  }>;
  setUnreadByChannel: React.Dispatch<React.SetStateAction<Record<string, SpaceChannelUnreadState>>>;
}

export function useSpacesSocketEffects(params: SpacesSocketEffectsParams): void {
  const {
    isLoggedIn,
    subscribe,
    onStateChange,
    setSpaces,
    setMessagesByChannel,
    activeSpaceIdRef,
    activeChannelIdRef,
    identityIdRef,
    refreshSpacesRef,
    refreshChannelMessagesRef,
    socketCallbacksRef,
    setUnreadByChannel,
  } = params;

  useEffect(() => {
    if (!isLoggedIn) return;

    const unsubMessage = subscribe((message: ChatIncomingMessage) => {
      handleSpaceSocketMessage(message, {
        setSpaces: (updater) => setSpaces((prev) => updater(prev)),
        setMessagesByChannel: (updater) => setMessagesByChannel((prev) => updater(prev)),
        activeSpaceId: activeSpaceIdRef.current,
        activeChannelId: activeChannelIdRef.current,
        identityId: identityIdRef.current,
        fetchChannelMessages: (spaceId, channelId) =>
          refreshChannelMessagesRef.current(spaceId, channelId),
        refreshSpaces: () => void refreshSpacesRef.current(),
        onSocketReactionAdded: (reaction) =>
          socketCallbacksRef.current.onReactionAdded?.(reaction),
        onSocketReactionRemoved: (messageId, reactionId) =>
          socketCallbacksRef.current.onReactionRemoved?.(messageId, reactionId),
        onSocketPinsUpdated: (messageId, action) =>
          socketCallbacksRef.current.onPinsUpdated?.(messageId, action),
        setUnreadByChannel: (updater) => setUnreadByChannel((prev) => updater(prev)),
      });
    });

    const unsubState = onStateChange((state) => {
      if (state === 'connected') {
        void refreshSpacesRef.current();
        const spaceId = activeSpaceIdRef.current;
        const channelId = activeChannelIdRef.current;
        if (spaceId && channelId) {
          refreshChannelMessagesRef.current(spaceId, channelId);
        }
      }
    });

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const spaceId = activeSpaceIdRef.current;
      const channelId = activeChannelIdRef.current;
      if (spaceId && channelId) {
        refreshChannelMessagesRef.current(spaceId, channelId);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      unsubMessage();
      unsubState();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [isLoggedIn, subscribe, onStateChange]);
}
