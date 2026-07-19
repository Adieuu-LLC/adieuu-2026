import type { TFunction } from 'i18next';
import type { ChannelMessage } from '../../components/messaging/channelMessage';
import type { ChannelListItem } from '../../utils/buildFlatMessageItems';
import { parsePayload } from '../../services/messagePayload';

const TOOLBAR_PIN_PREVIEW_MAX = 70;

/**
 * Lightweight change signal for scroll effects: changes on append (tail id),
 * prepend (head id + length), and tail edits (lastEditedAt) without allocating
 * an O(n) id-join string every change.
 */
export function buildMessageLayoutKey(channelMessages: ChannelMessage[]): string {
  const n = channelMessages.length;
  if (n === 0) return '';
  const first = channelMessages[0]!;
  const last = channelMessages[n - 1]!;
  return `${n}:${first.id}:${last.id}:${last.lastEditedAt ?? ''}`;
}

export function countVisibleMessages(flatItems: ChannelListItem<ChannelMessage>[]): number {
  return flatItems.reduce((n, item) => n + (item.type === 'message' ? 1 : 0), 0);
}

export function formatSpacePinPreview(body: string, t: TFunction): string {
  const { text } = parsePayload(body);
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return t('conversations.pinnedMessage', 'Pinned');
  if (cleaned.length <= TOOLBAR_PIN_PREVIEW_MAX) return cleaned;
  return `${cleaned.slice(0, TOOLBAR_PIN_PREVIEW_MAX)}…`;
}

export function resolveLatestPinInfo(
  channelMessages: ChannelMessage[],
  pinnedMessageIds: string[],
  pinnedCount: number,
  t: TFunction,
): { preview: string; messageId: string } | null {
  if (pinnedCount === 0) return null;
  // Oldest-first array: walk from the end to select the newest pinned message.
  let pinned: ChannelMessage | undefined;
  for (let i = channelMessages.length - 1; i >= 0; i--) {
    const m = channelMessages[i]!;
    if (pinnedMessageIds.includes(m.id)) {
      pinned = m;
      break;
    }
  }
  if (!pinned) return null;
  return { preview: formatSpacePinPreview(pinned.body, t), messageId: pinned.id };
}
