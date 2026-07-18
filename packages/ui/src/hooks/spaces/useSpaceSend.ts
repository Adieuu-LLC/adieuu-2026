import { useCallback, useRef } from 'react';
import type { PublicSpaceMessage, SendSpaceMessageParams } from '@adieuu/shared';
import type { SpaceChannelMessagesState } from './types';

type SpacesSendApiLike = {
  sendMessage: (
    spaceId: string,
    channelId: string,
    params: SendSpaceMessageParams,
  ) => Promise<{ success: boolean; data?: PublicSpaceMessage; error?: string }>;
};

export interface SpaceSendParams {
  api: { spaces: SpacesSendApiLike };
  activeSpaceIdRef: React.MutableRefObject<string | null>;
  activeChannelIdRef: React.MutableRefObject<string | null>;
  setSending: React.Dispatch<React.SetStateAction<boolean>>;
  setMessagesByChannel: React.Dispatch<React.SetStateAction<Record<string, SpaceChannelMessagesState>>>;
  showError?: (message: string) => void;
}

export function useSpaceSend(params: SpaceSendParams) {
  const { api, activeSpaceIdRef, activeChannelIdRef, setSending, setMessagesByChannel, showError } = params;
  const sendingRef = useRef(false);

  const sendMessage = useCallback(
    async (
      msgParams: SendSpaceMessageParams,
    ): Promise<PublicSpaceMessage | null> => {
      const spaceId = activeSpaceIdRef.current;
      const channelId = activeChannelIdRef.current;
      if (!spaceId || !channelId || sendingRef.current) return null;

      sendingRef.current = true;
      setSending(true);
      try {
        const clientMessageId = msgParams.clientMessageId ?? crypto.randomUUID();
        const res = await api.spaces.sendMessage(spaceId, channelId, {
          ...msgParams,
          clientMessageId,
        });
        if (res.success && res.data) {
          setMessagesByChannel((prev) => {
            const state = prev[channelId];
            if (!state) return prev;
            if (state.messages.some((m) => m.id === res.data!.id)) return prev;
            return {
              ...prev,
              [channelId]: {
                ...state,
                messages: [res.data!, ...state.messages],
              },
            };
          });
          return res.data;
        }
        if (showError) {
          showError(res.error ?? 'Failed to send message.');
        }
        return null;
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [api, activeSpaceIdRef, activeChannelIdRef, setSending, setMessagesByChannel, showError],
  );

  return { sendMessage };
}
