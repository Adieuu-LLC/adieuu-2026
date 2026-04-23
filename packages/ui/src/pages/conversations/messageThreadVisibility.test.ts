import { describe, expect, test } from 'bun:test';
import { computeManualLoadHints, countVisibleInThreadBatch } from './messageThreadVisibility';
import type { ConversationMessagesState, DisplayMessage } from '../../hooks/conversations/types';

const baseState = (): ConversationMessagesState => ({
  messages: [],
  olderCursor: 'abc',
  newerPaginationAfterId: null,
  hasNewerPages: true,
  loading: false,
  showManualLoadOlder: false,
  showManualLoadNewer: false,
});

describe('countVisibleInThreadBatch', () => {
  test('counts only decryptable user messages when artifacts off', () => {
    const a = {
      id: '1',
      messageType: 'user' as const,
      deleted: false,
      decryptedContent: '{}',
    } as DisplayMessage;
    const b = {
      id: '2',
      messageType: 'user' as const,
      deleted: false,
      decryptedContent: undefined,
      decryptionError: 'x',
    } as DisplayMessage;
    expect(countVisibleInThreadBatch([a, b], false, Date.now())).toBe(1);
  });
});

describe('computeManualLoadHints', () => {
  test('enables older manual when an older page is all non-visible and cursor remains', () => {
    const merged = { ...baseState(), olderCursor: 'next' };
    const out = computeManualLoadHints({
      prevOlder: false,
      prevNewer: false,
      mergedState: merged,
      newMessages: [
        { id: '1', messageType: 'user', deleted: false, decryptionError: 'bad' } as DisplayMessage,
      ],
      direction: 'older',
      mergeLatest: false,
      visibleInBatch: 0,
    });
    expect(out.showManualLoadOlder).toBe(true);
  });

  test('disables older manual when the batch is visible', () => {
    const merged = { ...baseState() };
    const out = computeManualLoadHints({
      prevOlder: true,
      prevNewer: false,
      mergedState: merged,
      newMessages: [{ id: '1', messageType: 'user', deleted: false, decryptedContent: '{}' } as DisplayMessage],
      direction: 'older',
      mergeLatest: false,
      visibleInBatch: 1,
    });
    expect(out.showManualLoadOlder).toBe(false);
  });
});
