import type { DecryptedConversation } from '../../hooks/useConversations';

/**
 * Resolve a sidebar-friendly display name for a conversation.
 * Groups use decryptedName (fallback "Group"); DMs prefer decryptedName, then
 * other participants' displayName / username / id joined by comma.
 */
export function resolveConversationDisplayName(
  conversation: DecryptedConversation,
  selfId: string | undefined,
  profiles: Record<string, { displayName?: string; username?: string }>,
): string {
  if (conversation.type === 'group') {
    return conversation.decryptedName ?? 'Group';
  }
  if (conversation.decryptedName?.trim()) {
    return conversation.decryptedName.trim();
  }
  const others = conversation.participants.filter((p) => p !== selfId);
  return others
    .map((pid) => {
      const p = profiles[pid];
      return p?.displayName ?? p?.username ?? pid;
    })
    .join(', ');
}
