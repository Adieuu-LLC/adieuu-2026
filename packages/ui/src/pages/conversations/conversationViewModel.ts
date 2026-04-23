import type { TFunction } from 'i18next';
import type { PublicIdentity } from '@adieuu/shared';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { DecryptedConversation } from '../../hooks/conversations/types';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { parsePayload } from '../../services/messagePayload';
import { type ChatItem, isSameDay } from './conversationUtils';
import type { MediaOutboxJobRecord } from '../../services/mediaOutbox/mediaOutboxTypes';

const PENDING_OUTBOX_INLINE_STAGES = new Set<MediaOutboxJobRecord['stage']>([
  'queued',
  'preparing',
  'encrypting',
  'uploading_e2e',
  'sending',
  'scan_upload',
]);

/**
 * Appends a non-interactive row when this conversation has media outbox jobs
 * actively in flight (failed jobs stay chrome-only so copy stays accurate).
 */
export function mergePendingOutboxIntoFlatItems(
  items: ChatItem[],
  conversationId: string | undefined,
  jobs: MediaOutboxJobRecord[]
): ChatItem[] {
  if (!conversationId) return items;
  const pending = jobs.filter(
    (j) => j.conversationId === conversationId && PENDING_OUTBOX_INLINE_STAGES.has(j.stage)
  );
  if (pending.length === 0) return items;
  const key = `pending-outbox:${conversationId}:${[...pending.map((p) => p.id)].sort().join(',')}`;
  return [...items, { type: 'pending-outbox', key, pendingCount: pending.length }];
}

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

export const TOOLBAR_PIN_PREVIEW_MAX = 70;

/**
 * Truncated preview for the header “latest pin” line (user message text or fallbacks).
 */
export function formatPinPreviewForToolbar(
  message: DisplayMessage | undefined,
  t: TFunction
): string {
  if (!message) return t('conversations.headerLatestPinLoading', 'Loading…');
  if (message.deleted) {
    return t('conversations.headerLatestPinUnavailable', 'Pinned message unavailable');
  }
  if (message.messageType === 'system') {
    return t('conversations.headerLatestPinSystem', 'System message');
  }
  const raw = message.decryptedContent ?? '';
  if (!raw) return t('conversations.headerLatestPinLoading', 'Loading…');
  const { text } = parsePayload(raw);
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return t('conversations.pinnedMessage', 'Pinned');
  if (cleaned.length <= TOOLBAR_PIN_PREVIEW_MAX) return cleaned;
  return `${cleaned.slice(0, TOOLBAR_PIN_PREVIEW_MAX)}…`;
}

/**
 * Matches server rules: DMs — any participant; groups — admins (with legacy createdBy fallback).
 */
export function canManageConversationPinsView(
  conversation: DecryptedConversation | undefined,
  identityId: string | undefined,
): boolean {
  if (!conversation || !identityId) return false;
  if (!conversation.participants.includes(identityId)) return false;
  if (conversation.type === 'dm') return true;
  const admins = conversation.admins;
  if (admins?.length) return admins.includes(identityId);
  return conversation.createdBy === identityId;
}
