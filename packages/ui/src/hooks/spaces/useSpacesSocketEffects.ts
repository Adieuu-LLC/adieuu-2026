import { useEffect, type MutableRefObject } from 'react';
import type { ChatIncomingMessage, ChatConnectionState, PublicSpace, PublicSpaceMessage } from '@adieuu/shared';
import { handleSpaceSocketMessage } from '../../services/spaceSocketHandlers';
import type { SpaceChannelMessagesState } from './types';

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
