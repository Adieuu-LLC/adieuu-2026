import type { TFunction } from 'i18next';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { DecryptedConversation } from '../../hooks/conversations/types';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { parsePayload } from '../../services/messagePayload';
import { type ChatItem, isSameDay } from './conversationUtils';

export function getReversedVisibleMessages(
  activeMessages: DisplayMessage[],
  showArtifacts: boolean,
): DisplayMessage[] {
  return [...activeMessages]
    .reverse()
    .filter((msg) => {
      if (showArtifacts) return true;
      if (msg.messageType === 'system') return true;
      if (msg.deleted) return false;
      if (!msg.decryptedContent && msg.decryptionError) return false;
      return true;
    });
}

export function getLastMessagePreviewText(activeMessages: DisplayMessage[]): string | undefined {
  for (let i = activeMessages.length - 1; i >= 0; i--) {
    const msg = activeMessages[i]!;
    if (!msg.decryptedContent || msg.deleted || msg.messageType === 'system') continue;
    const { text } = parsePayload(msg.decryptedContent);
    if (text) return text;
  }
  return undefined;
}

export function buildMessagesByIdMap(
  activeMessages: DisplayMessage[],
  replyParentHydrationMap: Record<string, DisplayMessage>,
): Map<string, DisplayMessage> {
  const m = new Map<string, DisplayMessage>();
  for (const msg of activeMessages) {
    m.set(msg.id, msg);
  }
  for (const [msgId, msg] of Object.entries(replyParentHydrationMap)) {
    if (!m.has(msgId)) {
      m.set(msgId, msg);
    }
  }
  return m;
}

export function buildFlatChatItems(
  reversedMessages: DisplayMessage[],
  unreadCount: number,
  nowMs: number,
): ChatItem[] {
  const items: ChatItem[] = [];
  const unreadIdx =
    unreadCount > 0 && unreadCount < reversedMessages.length
      ? reversedMessages.length - unreadCount
      : -1;

  for (let i = 0; i < reversedMessages.length; i++) {
    const msg = reversedMessages[i]!;
    if (msg.expiresAt && new Date(msg.expiresAt).getTime() <= nowMs) continue;

    const currDate = new Date(msg.createdAt);
    const prevItem = items.length > 0 ? items[items.length - 1] : null;
    const prevMsgDate = prevItem?.type === 'message' ? new Date(prevItem.msg.createdAt) : null;
    const showDaySep = !prevMsgDate || !isSameDay(prevMsgDate, currDate);

    if (showDaySep) {
      items.push({ type: 'day-separator', date: currDate, key: `day-${msg.id}` });
    }
    items.push({ type: 'message', msg, key: msg.id, isFirstUnread: i === unreadIdx || undefined });
  }
  return items;
}

export function resolveToolbarParticipantName(
  pid: string,
  memberSettings: MemberSettingsMap,
  participantProfiles: Record<string, PublicIdentity>,
): string {
  const nickname = memberSettings[pid]?.nickname;
  if (nickname) return nickname;
  const profile = participantProfiles[pid];
  return profile?.displayName ?? profile?.username ?? pid;
}

export function getConversationHeaderCopy(
  conversation: DecryptedConversation,
  identityId: string | undefined,
  participantProfiles: Record<string, PublicIdentity>,
  memberSettings: MemberSettingsMap,
  t: TFunction,
): {
  otherParticipantIds: string[];
  displayName: string;
  subtitle: string;
} {
  const otherParticipantIds = conversation.participants.filter((p) => p !== identityId);
  const resolveToolbarName = (pid: string) =>
    resolveToolbarParticipantName(pid, memberSettings, participantProfiles);

  const displayName =
    conversation.type === 'group'
      ? (conversation.decryptedName ?? t('conversations.group', 'Group'))
      : conversation.decryptedName?.trim()
        ? conversation.decryptedName.trim()
        : otherParticipantIds.map(resolveToolbarName).join(', ');

  const subtitle =
    conversation.type === 'group'
      ? `${conversation.participants.length} ${t('conversations.members', 'members')}`
      : t('conversations.directMessage', 'Direct message');

  return { otherParticipantIds, displayName, subtitle };
}
