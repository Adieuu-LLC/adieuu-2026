import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { createApiClient } from '@adieuu/shared';
import { useToast } from '../../components/Toast';
import { useCallSession } from '../useCallSession';
import { useCall } from '../useCall';
import { forceEndCall as apiForceEndCall } from '../../services/callService';
import type { DecryptedConversation } from './types';

type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Owns the conversation's call state: the shared call session, the
 * conversation-scoped active call, the troubleshoot modal, force-end action,
 * and the derived flags that drive the call button and active-call banner.
 */
export function useConversationCallState(params: {
  conversationId: string | undefined;
  conversation: DecryptedConversation | undefined;
  apiClient: ApiClient['client'];
}) {
  const { conversationId, conversation, apiClient } = params;
  const { t } = useTranslation();
  const toast = useToast();

  const callSession = useCallSession();
  const conversationCall = useCall(conversationId ?? null);
  const [troubleshootOpen, setTroubleshootOpen] = useState(false);

  const handleForceEndCall = useCallback(async () => {
    const callId = conversationCall.activeCall?.id;
    if (!conversationId || !callId) return false;
    try {
      const result = await apiForceEndCall(apiClient, conversationId, callId);
      if (result.success) {
        toast.success(t('call.forceEndSuccess'));
        conversationCall.refetch();
        return true;
      }
      toast.error(t('call.forceEndFailed'));
      return false;
    } catch (err) {
      console.warn('[ConversationView] force end call failed', err);
      toast.error(t('call.forceEndFailed'));
      return false;
    }
  }, [conversationId, conversationCall.activeCall?.id, apiClient, toast, t, conversationCall.refetch]);

  const audioAllowed = !(conversation?.audioCallsDisabled ?? false);

  const isInCallElsewhere =
    callSession.activeSession !== null &&
    callSession.activeSession.conversationId !== conversationId;
  const isInCallHere =
    callSession.activeSession !== null &&
    callSession.activeSession.conversationId === conversationId;

  const hasActiveCallToJoin =
    conversationCall.activeCall !== null && !conversationCall.isInCall && !isInCallHere;

  // Ghost state: server thinks we're in the call, but we have no local
  // LiveKit session. This happens when the client disconnected without
  // successfully leaving the call on the server.
  const isGhostParticipant =
    conversationCall.activeCall !== null && conversationCall.isInCall && !isInCallHere;

  const showCallBanner = hasActiveCallToJoin || isGhostParticipant;

  return {
    callSession,
    conversationCall,
    troubleshootOpen,
    setTroubleshootOpen,
    handleForceEndCall,
    audioAllowed,
    isInCallElsewhere,
    isInCallHere,
    hasActiveCallToJoin,
    isGhostParticipant,
    showCallBanner,
  };
}
