import type { ConversationMessagesState, DisplayMessage } from '../../hooks/conversations/types';

/**
 * How many of these messages would render as a visible row in the thread (day separators excluded),
 * for the same rules as getReversedVisibleMessages + buildFlatChatItems (expired TTL).
 */
export function countVisibleInThreadBatch(
  messages: DisplayMessage[],
  showArtifacts: boolean,
  nowMs: number
): number {
  let n = 0;
  for (const msg of messages) {
    if (msg.expiresAt && new Date(msg.expiresAt).getTime() <= nowMs) continue;
    if (showArtifacts) {
      n += 1;
      continue;
    }
    if (msg.messageType === 'system') {
      n += 1;
      continue;
    }
    if (msg.deleted) continue;
    if (!msg.decryptedContent && msg.decryptionError) continue;
    n += 1;
  }
  return n;
}

/**
 * When a pagination fetch returns a page with no visible rows, show a manual CTA
 * so the user can keep paging (without auto chain-fetching).
 */
export function computeManualLoadHints(input: {
  prevOlder: boolean;
  prevNewer: boolean;
  mergedState: ConversationMessagesState;
  newMessages: DisplayMessage[];
  direction: 'older' | 'newer' | undefined;
  mergeLatest: boolean;
  visibleInBatch: number;
}): { showManualLoadOlder: boolean; showManualLoadNewer: boolean } {
  const { mergedState, newMessages, direction, mergeLatest, visibleInBatch, prevOlder, prevNewer } =
    input;
  if (mergeLatest) {
    return { showManualLoadOlder: false, showManualLoadNewer: false };
  }
  if (visibleInBatch > 0) {
    return {
      showManualLoadOlder: direction === 'newer' ? prevOlder : direction === 'older' || !direction ? false : prevOlder,
      showManualLoadNewer: direction === 'older' || !direction ? prevNewer : direction === 'newer' ? false : prevNewer,
    };
  }
  if (newMessages.length === 0) {
    return {
      showManualLoadOlder: mergedState.olderCursor ? prevOlder : false,
      showManualLoadNewer: mergedState.hasNewerPages ? prevNewer : false,
    };
  }
  if (direction === 'older' || direction === undefined) {
    return {
      showManualLoadOlder: !!mergedState.olderCursor,
      showManualLoadNewer: prevNewer,
    };
  }
  if (direction === 'newer') {
    return {
      showManualLoadOlder: prevOlder,
      showManualLoadNewer: mergedState.hasNewerPages,
    };
  }
  return { showManualLoadOlder: prevOlder, showManualLoadNewer: prevNewer };
}
