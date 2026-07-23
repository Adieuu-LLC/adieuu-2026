import { useCallback } from 'react';
import type { GifContentFilter } from '@adieuu/shared';

/**
 * Admin/settings toggle handlers surfaced through the toolbar and settings
 * sidebar. Each handler is a thin, id-guarded wrapper over the corresponding
 * conversation mutation.
 */
export function useConversationAdminSettings(params: {
  conversationId: string | undefined;
  updateGifsDisabled: (id: string, disabled: boolean) => Promise<boolean>;
  updateGifContentFilter: (id: string, filter: GifContentFilter) => Promise<boolean>;
  updateCustomEmojisDisabled: (id: string, disabled: boolean) => Promise<boolean>;
  updateMessageSearchCachePolicy: (id: string, disallow: boolean) => Promise<boolean>;
  updateAllowSkipModeration: (id: string, allow: boolean) => Promise<boolean>;
  updateCallSettings: (
    id: string,
    settings: { audioCallsDisabled?: boolean; videoCallsDisabled?: boolean; screenshareDisabled?: boolean },
  ) => Promise<boolean>;
}) {
  const {
    conversationId,
    updateGifsDisabled,
    updateGifContentFilter,
    updateCustomEmojisDisabled,
    updateMessageSearchCachePolicy,
    updateAllowSkipModeration,
    updateCallSettings,
  } = params;

  const handleGifsDisabledByAdminToggle = useCallback(
    async (disabled: boolean) => {
      if (!conversationId) return;
      await updateGifsDisabled(conversationId, disabled);
    },
    [conversationId, updateGifsDisabled],
  );

  const handleGifContentFilterChange = useCallback(
    async (filter: GifContentFilter) => {
      if (!conversationId) return;
      await updateGifContentFilter(conversationId, filter);
    },
    [conversationId, updateGifContentFilter],
  );

  const handleCustomEmojisDisabledByAdminToggle = useCallback(
    async (disabled: boolean) => {
      if (!conversationId) return;
      await updateCustomEmojisDisabled(conversationId, disabled);
    },
    [conversationId, updateCustomEmojisDisabled],
  );

  const handleMessageSearchCachePolicyToggle = useCallback(
    async (disallow: boolean) => {
      if (!conversationId) return;
      await updateMessageSearchCachePolicy(conversationId, disallow);
    },
    [conversationId, updateMessageSearchCachePolicy],
  );

  const handleAllowSkipModerationToggle = useCallback(
    async (allow: boolean) => {
      if (!conversationId) return;
      await updateAllowSkipModeration(conversationId, allow);
    },
    [conversationId, updateAllowSkipModeration],
  );

  const handleAudioCallsDisabledToggle = useCallback(
    async (disabled: boolean) => {
      if (!conversationId) return;
      await updateCallSettings(conversationId, { audioCallsDisabled: disabled });
    },
    [conversationId, updateCallSettings],
  );

  const handleVideoCallsDisabledToggle = useCallback(
    async (disabled: boolean) => {
      if (!conversationId) return;
      await updateCallSettings(conversationId, { videoCallsDisabled: disabled });
    },
    [conversationId, updateCallSettings],
  );

  const handleScreenshareDisabledToggle = useCallback(
    async (disabled: boolean) => {
      if (!conversationId) return;
      await updateCallSettings(conversationId, { screenshareDisabled: disabled });
    },
    [conversationId, updateCallSettings],
  );

  return {
    handleGifsDisabledByAdminToggle,
    handleGifContentFilterChange,
    handleCustomEmojisDisabledByAdminToggle,
    handleMessageSearchCachePolicyToggle,
    handleAllowSkipModerationToggle,
    handleAudioCallsDisabledToggle,
    handleVideoCallsDisabledToggle,
    handleScreenshareDisabledToggle,
  };
}
