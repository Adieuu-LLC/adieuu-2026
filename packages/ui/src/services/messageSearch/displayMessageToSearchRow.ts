import type { DisplayMessage } from '../../hooks/conversations/types';
import { parsePayload } from '../messagePayload';

import type { MessageSearchCacheRow } from './messageSearchCacheTypes';

function normaliseBody(plaintext: string): string {
  if (!plaintext.trim()) return '';
  const parsed = parsePayload(plaintext);
  const hasMedia =
    (parsed.attachments?.length ?? 0) > 0 || (parsed.gifAttachments?.length ?? 0) > 0;
  const t = (parsed.text ?? '').trim();
  if (!t && hasMedia) {
    return '\u200b';
  }
  return t;
}

/**
 * Map a visible decrypted user message to a local search row. Skips system / empty rows.
 */
export function displayMessageToSearchRow(message: DisplayMessage): MessageSearchCacheRow | null {
  if (message.deleted) return null;
  if (message.messageType === 'system') return null;
  const raw = message.decryptedContent;
  if (raw == null || raw === '') {
    if (!message.replyToMessageId) return null;
  }

  const bodyText = raw != null ? normaliseBody(raw) : '';
  const parsed = raw != null ? parsePayload(raw) : null;
  const hasAttachments =
    (parsed?.attachments?.length ?? 0) > 0 || (parsed?.gifAttachments?.length ?? 0) > 0;

  const created = Date.parse(message.createdAt);
  const timestamp = Number.isFinite(created) ? created : Date.now();

  return {
    messageId: message.id,
    conversationId: message.conversationId,
    timestamp,
    authorId: message.fromIdentityId,
    bodyText,
    hasAttachments,
    isReply: !!message.replyToMessageId,
    parentMessageId: message.replyToMessageId,
    hasReplies: false,
  };
}

