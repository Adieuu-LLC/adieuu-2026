/**
 * Active-call banner and troubleshoot modal for a conversation. Presentational
 * wrapper around the call state coordinated in {@link ConversationView}.
 */

import type { ReactNode } from 'react';
import { ActiveCallBanner } from '../../components/call/ActiveCallBanner';
import { CallTroubleshootModal } from '../../components/call/CallTroubleshootModal';
import type { useConversationCallState } from '../../hooks/conversations/useConversationCallState';

export interface ConversationCallSectionProps {
  conversationId: string | undefined;
  call: ReturnType<typeof useConversationCallState>;
}

export function ConversationCallSection({ conversationId, call }: ConversationCallSectionProps): ReactNode {
  return (
    <>
      {call.showCallBanner && call.conversationCall.activeCall && (
        <ActiveCallBanner
          participantCount={call.conversationCall.participants.length}
          participants={call.conversationCall.participants}
          isGhostState={call.isGhostParticipant}
          onJoin={() => {
            if (conversationId && call.conversationCall.activeCall) {
              call.callSession.requestJoinCall(
                conversationId,
                call.conversationCall.activeCall.id,
                { audio: true, video: false, screenshare: false },
              );
            }
          }}
          onTroubleshoot={() => call.setTroubleshootOpen(true)}
        />
      )}

      <CallTroubleshootModal
        open={call.troubleshootOpen}
        onOpenChange={call.setTroubleshootOpen}
        onForceEnd={call.handleForceEndCall}
      />
    </>
  );
}
