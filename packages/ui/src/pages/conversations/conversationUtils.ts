import type { TFunction } from 'i18next';
import type { DisplayMessage } from '../../hooks/useConversations';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import { parsePayload } from '../../services/messagePayload';
import { getEmojiMartShortcodeLabel } from '../../utils/emojiMartShortcode';
import type { GroupedReaction } from '../../hooks/useReactions';
import type { PublicIdentity } from '@adieuu/shared';

export const MEMBER_COLORS = [
  '#e57373', '#f06292', '#ba68c8', '#9575cd',
  '#7986cb', '#64b5f6', '#4fc3f7', '#4dd0e1',
  '#4db6ac', '#81c784', '#aed581', '#dce775',
  '#ffd54f', '#ffb74d', '#ff8a65', '#a1887f',
] as const;

export const FIRST_ITEM_INDEX = 1_000_000;

export type ReplyQuoteAuthorPreview = {
  displayName: string;
  avatarUrl?: string;
};

export type ReplyQuotePayload = {
  text: string;
  onQuoteClick: () => void;
  quotedAuthor?: ReplyQuoteAuthorPreview;
};

export type ChatItem =
  | { type: 'day-separator'; date: Date; key: string }
  | { type: 'message'; msg: DisplayMessage; key: string; isFirstUnread?: boolean }
  | { type: 'pending-outbox'; key: string; pendingCount: number };

export function resolveDisplayName(
  identityId: string,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  selfId?: string,
  t?: (key: string, fallback: string) => string,
): string {
  if (selfId && identityId === selfId && t) {
    return settings[identityId]?.nickname || t('conversations.you', 'You');
  }
  const nickname = settings[identityId]?.nickname;
  if (nickname) return nickname;
  const p = profiles[identityId];
  return p?.displayName ?? p?.username ?? identityId.slice(0, 8);
}

export function buildReplySnippet(parent: DisplayMessage | undefined, t: TFunction): string {
  if (!parent) return t('conversations.replyOriginal', 'Original message');
  if (parent.deleted) return t('conversations.replyDeleted', 'Message deleted');
  if (parent.messageType === 'system') return t('conversations.replySystem', 'System message');
  const raw = parent.decryptedContent?.trim();
  if (!raw) return t('conversations.replyOriginal', 'Original message');
  const parsed = parsePayload(raw);
  const text = parsed.text.trim();
  if (!text && parsed.attachments.length > 0) {
    return t('conversations.replyMediaOnly', 'Image');
  }
  if (!text) return t('conversations.replyOriginal', 'Original message');
  const words = text.split(/\s+/).filter(Boolean);
  const lead = words.slice(0, 6).join(' ');
  return words.length > 6 ? `${lead}…` : lead;
}

export function replyComposerLabel(
  target: DisplayMessage,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  t: TFunction,
): string {
  const name = resolveDisplayName(target.fromIdentityId, profiles, settings);
  const snippet = buildReplySnippet(target, t);
  return `${name}: ${snippet}`;
}

export function resolveQuotedAuthorPreview(
  parent: DisplayMessage | undefined,
  participantProfiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  self: PublicIdentity | null | undefined,
): ReplyQuoteAuthorPreview | undefined {
  if (!parent) return undefined;
  const profile =
    parent.fromIdentityId === self?.id
      ? self ?? undefined
      : participantProfiles[parent.fromIdentityId];
  const nickname = settings[parent.fromIdentityId]?.nickname;
  if (nickname) {
    return { displayName: nickname, avatarUrl: profile?.avatarUrl };
  }
  if (profile) {
    return {
      displayName: profile.displayName?.trim() || profile.username || '?',
      avatarUrl: profile.avatarUrl,
    };
  }
  return { displayName: '?' };
}

export function buildReactionTooltip(
  reaction: GroupedReaction,
  profiles: Record<string, PublicIdentity>,
  settings: MemberSettingsMap,
  currentIdentityId: string | undefined,
): string {
  const shortcode = getEmojiMartShortcodeLabel(reaction.emoji);
  const MAX_NAMED = 3;

  const names: string[] = [];
  if (reaction.isOwn) names.push('You');

  for (const id of reaction.fromIdentityIds) {
    if (id === currentIdentityId) continue;
    if (names.length >= MAX_NAMED) break;
    names.push(resolveDisplayName(id, profiles, settings));
  }

  const othersCount = reaction.count - names.length;
  let label = names.join(', ');
  if (othersCount > 0) label += ` + ${othersCount} other${othersCount === 1 ? '' : 's'}`;

  return `${label} reacted with ${shortcode}`;
}

export function formatRotationInterval(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours}h`;
  const days = hours / 24;
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(date, now)) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return `Yesterday at ${time}`;

  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    const dayName = date.toLocaleDateString([], { weekday: 'long' });
    return `${dayName} at ${time}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${time}`;
  }

  return `${date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} at ${time}`;
}

/** Locale-aware calendar date for conversation header "since …" (no time of day). */
export function formatConversationSinceDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAbsoluteTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString([], {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });
}

export function formatDayLabel(date: Date): string {
  const now = new Date();
  if (isSameDay(date, now)) return 'Today';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  }

  return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
