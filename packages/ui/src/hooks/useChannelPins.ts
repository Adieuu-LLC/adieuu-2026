/**
 * Shared channel pins hook.
 *
 * Manages pinned message state for a channel. Domain-specific API calls
 * are delegated to a {@link ChannelPinsAdapter}.
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type { ChannelMessage } from '../components/messaging/channelMessage';

// ---------------------------------------------------------------------------
// Adapter interface
// ---------------------------------------------------------------------------

export interface ChannelPinsAdapter {
  pinMessage(channelId: string, messageId: string): Promise<boolean>;
  unpinMessage(channelId: string, messageId: string): Promise<boolean>;
  getPinnedMessages(
    channelId: string,
    cursor?: string | null,
  ): Promise<{ messages: ChannelMessage[]; nextCursor: string | null } | null>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useChannelPins(
  channelId: string | null | undefined,
  adapter: ChannelPinsAdapter,
  canManage: boolean,
) {
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);

  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const channelIdRef = useRef(channelId);
  channelIdRef.current = channelId;

  useEffect(() => {
    setPinnedMessageIds([]);
  }, [channelId]);

  const pinnedMessageIdsKey = useMemo(
    () => pinnedMessageIds.join(','),
    [pinnedMessageIds],
  );

  const onPin = useCallback(
    async (messageId: string) => {
      const cId = channelIdRef.current;
      if (!cId || !canManage) return;

      setPinnedMessageIds((prev) =>
        prev.includes(messageId) ? prev : [...prev, messageId],
      );

      try {
        const ok = await adapterRef.current.pinMessage(cId, messageId);
        if (!ok) {
          setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
        }
      } catch {
        setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
      }
    },
    [canManage],
  );

  const onUnpin = useCallback(
    async (messageId: string) => {
      const cId = channelIdRef.current;
      if (!cId || !canManage) return;

      setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));

      try {
        const ok = await adapterRef.current.unpinMessage(cId, messageId);
        if (!ok) {
          setPinnedMessageIds((prev) =>
            prev.includes(messageId) ? prev : [...prev, messageId],
          );
        }
      } catch {
        setPinnedMessageIds((prev) =>
          prev.includes(messageId) ? prev : [...prev, messageId],
        );
      }
    },
    [canManage],
  );

  const loadPinnedMessagesPage = useCallback(
    async (cId: string, cursor?: string | null) => {
      return adapterRef.current.getPinnedMessages(cId, cursor);
    },
    [],
  );

  const ingestSocketPinsUpdate = useCallback(
    (pinIds: string[]) => {
      setPinnedMessageIds(pinIds);
    },
    [],
  );

  const ingestSocketPinChange = useCallback(
    (messageId: string, action: 'pinned' | 'unpinned') => {
      if (action === 'pinned') {
        setPinnedMessageIds((prev) =>
          prev.includes(messageId) ? prev : [...prev, messageId],
        );
      } else {
        setPinnedMessageIds((prev) => prev.filter((id) => id !== messageId));
      }
    },
    [],
  );

  return useMemo(
    () => ({
      pinnedMessageIds,
      pinnedMessageIdsKey,
      pinnedCount: pinnedMessageIds.length,
      canManagePins: canManage,
      onPin,
      onUnpin,
      loadPinnedMessagesPage,
      ingestSocketPinsUpdate,
      ingestSocketPinChange,
    }),
    [
      pinnedMessageIds,
      pinnedMessageIdsKey,
      canManage,
      onPin,
      onUnpin,
      loadPinnedMessagesPage,
      ingestSocketPinsUpdate,
      ingestSocketPinChange,
    ],
  );
}
