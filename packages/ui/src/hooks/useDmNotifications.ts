/**
 * Hook for global DM notifications.
 *
 * Listens for new DM messages and reactions across all conversations and shows
 * toast notifications when the user is not actively reading that conversation
 * in a focused, visible window (or when viewing another conversation).
 * Optional native (OS) notifications are gated in Account &gt; Notification Settings.
 * Clicking a toast or native alert navigates to the conversation.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient } from '@adieuu/shared';
import { useChatConnection } from './useChatConnection';
import { useIdentity } from './useIdentity';
import { useDmReactions } from './useDmReactions';
import { useAppConfig, usePlatformCapabilities } from '../config';
import { useToast } from '../components/Toast';
import { useNativeNotificationsPreference } from './useNativeNotificationsPreference';
import { useNotificationSoundPreference } from './useNotificationSoundPreference';
import {
  maybeShowNativeNotification,
  readFocusVisibilitySnapshot,
  shouldSuppressInAppToastForConversation,
} from '../utils/dmNotificationRules';
import { playNotificationSound } from '../utils/notificationSound';
import { decryptSenderHint } from '../services/dmMessageService';
import { getCachedParticipant } from '../services/participantCache';
import type { DmNewMessageEvent, DmReactionNewEvent } from './useDmSubscription';

interface RawWsMessage {
  type: string;
  payload?: unknown;
}

/**
 * Hook that shows toast notifications for new DM messages.
 *
 * Should be rendered once at the app level (e.g., in App.tsx or a layout component).
 * Shows a toast when:
 * - A new DM message arrives
 * - Someone reacts to a message (recipient sees the reaction event)
 * - The user is not actively reading that conversation in a focused, visible window
 *
 * Native notifications (when enabled under Notification Settings) mirror that alert when the
 * window is unfocused or the tab is hidden, so messages surface on other monitors.
 *
 * Clicking the toast or native notification navigates to the conversation.
 *
 * @example
 * ```tsx
 * function App() {
 *   useDmNotifications();
 *   return <RouterProvider router={router} />;
 * }
 * ```
 */
export function useDmNotifications(): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { apiBaseUrl } = useAppConfig();
  const { status, identity } = useIdentity();
  const { onMessage } = useChatConnection();
  const toast = useToast();
  const { notifications, audio } = usePlatformCapabilities();
  const nativeNotificationsEnabled = useNativeNotificationsPreference();
  const soundPref = useNotificationSoundPreference();
  const { fetchReactions } = useDmReactions();

  const isLoggedIn = status === 'logged_in' && identity !== null;

  const identityRef = useRef(identity);
  identityRef.current = identity;

  const locationRef = useRef(location);
  locationRef.current = location;

  const soundPrefRef = useRef(soundPref);
  soundPrefRef.current = soundPref;
  const audioRef = useRef(audio);
  audioRef.current = audio;

  const handleNewMessage = useCallback(
    async (event: DmNewMessageEvent) => {
      const currentIdentity = identityRef.current;
      if (!currentIdentity) return;

      const message = event.payload.message;
      const conversationId = message.conversationId;
      const conversationPath = `/conversation/${conversationId}`;

      const isViewingConversation = locationRef.current.pathname === conversationPath;
      if (shouldSuppressInAppToastForConversation(isViewingConversation, readFocusVisibilitySnapshot())) {
        return;
      }

      let senderName = t('messages.newMessage');
      try {
        // Prefer plaintext fromIdentityId; fall back to sender hint for pre-migration messages
        let senderId = message.fromIdentityId;
        if (!senderId) {
          senderId = decryptSenderHint(
            conversationId,
            message.encryptedSenderId,
            message.clientMessageId,
            message.cryptoProfile
          );
        }

        if (senderId === currentIdentity.id) {
          return;
        }

        const api = createApiClient({ baseUrl: apiBaseUrl });
        const response = await api.identity.getById(senderId);
        if (response.success && response.data) {
          senderName = response.data.displayName;
        }
      } catch {
        // Could not resolve sender - still show generic notification
      }

      // Re-check route after async work; the user may have navigated during API calls
      const currentIsViewing = locationRef.current.pathname === conversationPath;
      const snapshot = readFocusVisibilitySnapshot();
      if (shouldSuppressInAppToastForConversation(currentIsViewing, snapshot)) {
        return;
      }

      const description = t('messages.newMessageDescription');
      toast.message(senderName, description, () => {
        navigate(conversationPath);
      });
      maybeShowNativeNotification(
        notifications,
        nativeNotificationsEnabled,
        senderName,
        description,
        `dm-msg-${conversationId}`,
        navigate,
        conversationPath,
        snapshot
      );
      void playNotificationSound({
        enabled: soundPrefRef.current.enabled,
        soundId: soundPrefRef.current.soundId,
        customPath: soundPrefRef.current.customPath,
        suppressWhenFocused: soundPrefRef.current.suppressWhenFocused,
        isViewingConversation: currentIsViewing,
        snapshot,
        volume: soundPrefRef.current.volume,
        loadCustomSound:
          soundPrefRef.current.soundId === 'custom' && audioRef.current?.loadSoundFromPath
            ? (p) => audioRef.current!.loadSoundFromPath(p)
            : undefined,
      });
    },
    [apiBaseUrl, navigate, nativeNotificationsEnabled, notifications, t, toast]
  );

  const handleReactionNew = useCallback(
    async (event: DmReactionNewEvent) => {
      const currentIdentity = identityRef.current;
      if (!currentIdentity) return;

      const rawReaction = event.payload.reaction;
      const conversationId = rawReaction.conversationId;
      const messageId = rawReaction.messageId;
      const conversationPath = `/conversation/${conversationId}`;

      const isViewingConversation = locationRef.current.pathname === conversationPath;
      if (shouldSuppressInAppToastForConversation(isViewingConversation, readFocusVisibilitySnapshot())) {
        return;
      }

      const cached = await getCachedParticipant(currentIdentity.id, conversationId);
      const otherParticipantId = cached?.otherIdentityId ?? null;

      let reactorName = t('messages.someone');
      try {
        const decrypted = await fetchReactions(
          conversationId,
          [messageId],
          otherParticipantId
        );
        const match = decrypted.find((d) => d.raw.id === rawReaction.id);
        const reactorId = match?.decrypted?.fromIdentityId;

        if (reactorId === currentIdentity.id) {
          return;
        }

        if (reactorId) {
          const api = createApiClient({ baseUrl: apiBaseUrl });
          const response = await api.identity.getById(reactorId);
          if (response.success && response.data) {
            reactorName = response.data.displayName;
          }
        }
      } catch {
        // Keep generic reactorName
      }

      // Re-check route after async work; the user may have navigated during API calls
      const currentIsViewing = locationRef.current.pathname === conversationPath;
      const snapshot = readFocusVisibilitySnapshot();
      if (shouldSuppressInAppToastForConversation(currentIsViewing, snapshot)) {
        return;
      }

      const description = t('messages.reactedToYourMessage');
      toast.message(reactorName, description, () => {
        navigate(conversationPath);
      });
      maybeShowNativeNotification(
        notifications,
        nativeNotificationsEnabled,
        reactorName,
        description,
        `dm-react-${conversationId}-${messageId}`,
        navigate,
        conversationPath,
        snapshot
      );
      void playNotificationSound({
        enabled: soundPrefRef.current.enabled,
        soundId: soundPrefRef.current.soundId,
        customPath: soundPrefRef.current.customPath,
        suppressWhenFocused: soundPrefRef.current.suppressWhenFocused,
        isViewingConversation: currentIsViewing,
        snapshot,
        volume: soundPrefRef.current.volume,
        loadCustomSound:
          soundPrefRef.current.soundId === 'custom' && audioRef.current?.loadSoundFromPath
            ? (p) => audioRef.current!.loadSoundFromPath(p)
            : undefined,
      });
    },
    [
      apiBaseUrl,
      fetchReactions,
      navigate,
      nativeNotificationsEnabled,
      notifications,
      t,
      toast,
    ]
  );

  useEffect(() => {
    if (!isLoggedIn) return;

    return onMessage((msg) => {
      const raw = msg as unknown as RawWsMessage;
      if (raw.type === 'dm:new') {
        const event = raw as unknown as DmNewMessageEvent;
        void handleNewMessage(event);
      }
      if (raw.type === 'dm:reaction:new') {
        const event = raw as unknown as DmReactionNewEvent;
        void handleReactionNew(event);
      }
    });
  }, [isLoggedIn, onMessage, handleNewMessage, handleReactionNew]);
}
