/**
 * Hook for global DM notifications.
 *
 * Listens for new DM messages across all conversations and shows
 * toast notifications when the user is not viewing the conversation.
 * Clicking the toast navigates to the conversation.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createApiClient } from '@adieuu/shared';
import { useChatConnection } from './useChatConnection';
import { useIdentity } from './useIdentity';
import { useAppConfig } from '../config';
import { useToast } from '../components/Toast';
import { decryptSenderHint } from '../services/dmMessageService';
import { getCachedParticipant, cacheParticipant } from '../services/participantCache';
import type { DmNewMessageEvent } from './useDmSubscription';

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
 * - The user is not currently viewing that conversation
 *
 * Clicking the toast navigates to the conversation.
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

  const isLoggedIn = status === 'logged_in' && identity !== null;

  const identityRef = useRef(identity);
  identityRef.current = identity;

  const handleNewMessage = useCallback(
    async (event: DmNewMessageEvent) => {
      const currentIdentity = identityRef.current;
      if (!currentIdentity) return;

      const message = event.payload.message;
      const conversationId = message.conversationId;

      // Check if user is currently viewing this conversation
      const isViewingConversation = location.pathname === `/conversation/${conversationId}`;
      if (isViewingConversation) {
        return;
      }

      // Try to get sender info for the toast
      let senderName = t('messages.newMessage');
      try {
        const senderId = decryptSenderHint(
          conversationId,
          message.encryptedSenderId,
          message.clientMessageId,
          message.cryptoProfile
        );

        // Don't show notification for our own messages
        if (senderId === currentIdentity.id) {
          return;
        }

        // Try to get sender name from cache or API
        const cached = await getCachedParticipant(currentIdentity.id, conversationId);
        if (cached && cached.otherIdentityId === senderId) {
          const api = createApiClient({ baseUrl: apiBaseUrl });
          const response = await api.identity.getById(senderId);
          if (response.success && response.data) {
            senderName = response.data.displayName;
          }
        } else {
          const api = createApiClient({ baseUrl: apiBaseUrl });
          const [identityResponse, keysResponse] = await Promise.all([
            api.identity.getById(senderId),
            api.identity.getPublicKeys(senderId),
          ]);

          if (identityResponse.success && identityResponse.data) {
            senderName = identityResponse.data.displayName;
            
            // Cache for future use
            if (keysResponse.success && keysResponse.data?.signingPublicKey) {
              await cacheParticipant({
                myIdentityId: currentIdentity.id,
                conversationId,
                otherIdentityId: senderId,
                signingPublicKey: keysResponse.data.signingPublicKey,
                cachedAt: Date.now(),
              });
            }
          }
        }
      } catch {
        // Could not decrypt sender - still show generic notification
      }

      // Show toast notification with action to navigate to conversation
      toast.message(senderName, t('messages.newMessageDescription'), () => {
        navigate(`/conversation/${conversationId}`);
      });
    },
    [apiBaseUrl, location.pathname, navigate, t, toast]
  );

  useEffect(() => {
    if (!isLoggedIn) return;

    return onMessage((msg) => {
      const raw = msg as unknown as RawWsMessage;
      if (raw.type === 'dm:new') {
        const event = raw as unknown as DmNewMessageEvent;
        handleNewMessage(event);
      }
    });
  }, [isLoggedIn, onMessage, handleNewMessage]);
}
