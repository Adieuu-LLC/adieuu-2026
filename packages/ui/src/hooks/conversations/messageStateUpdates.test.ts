import { describe, expect, test } from 'bun:test';
import { MAX_LOADED_MESSAGES } from '../../pages/conversations/conversationScrollUtils';
import { applyFetchedMessagesToConversationState } from './messageStateUpdates';
import type { ConversationMessagesState, DisplayMessage } from './types';

function msg(id: string, overrides?: Partial<DisplayMessage>): DisplayMessage {
  return {
    id,
    conversationId: 'c1',
    fromIdentityId: 'x',
    createdAt: new Date().toISOString(),
    ciphertext: 'x',
    nonce: 'n',
    wrappedKeys: [],
    signature: 's',
    cryptoProfile: 'default',
    clientMessageId: '00000000-0000-4000-8000-000000000000',
    deleted: false,
    revisionCount: 0,
    ...overrides,
  } as DisplayMessage;
}

describe('applyFetchedMessagesToConversationState', () => {
  test('mergeLatest prepends new messages, preserves olderCursor, trims', () => {
    const prev: Record<string, ConversationMessagesState> = {
      c1: {
        messages: [msg('old1')],
        olderCursor: 'cur-old',
        newerPaginationAfterId: 'old1',
        hasNewerPages: false,
        loading: true,
        showManualLoadOlder: false,
        showManualLoadNewer: false,
      },
    };
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: true,
      newMessages: [msg('new1')],
      direction: undefined,
      cursor: 'ignored',
      hasNewerPagesFromApi: true,
      unreadCount: 0,
      isAtBottom: true,
    });
    expect(next.c1?.messages.map((m) => m.id)).toEqual(['new1', 'old1']);
    expect(next.c1?.olderCursor).toBe('cur-old');
    expect(next.c1?.hasNewerPages).toBe(true);
    expect(next.c1?.loading).toBe(false);
  });

  test('mergeLatest replaces in place when the same id has updated ciphertext (edit)', () => {
    const prev: Record<string, ConversationMessagesState> = {
      c1: {
        messages: [msg('a', { ciphertext: 'old' })],
        olderCursor: null,
        newerPaginationAfterId: 'a',
        hasNewerPages: false,
        loading: false,
        showManualLoadOlder: false,
        showManualLoadNewer: false,
      },
    };
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: true,
      newMessages: [msg('a', { ciphertext: 'new', revisionCount: 1 })],
      direction: undefined,
      cursor: undefined,
      hasNewerPagesFromApi: false,
      unreadCount: 0,
      isAtBottom: true,
    });
    expect(next.c1?.messages[0]?.ciphertext).toBe('new');
    expect(next.c1?.messages[0]?.revisionCount).toBe(1);
  });

  test('mergeLatest returns prev when no new ids', () => {
    const prev: Record<string, ConversationMessagesState> = {
      c1: {
        messages: [msg('a')],
        olderCursor: null,
        newerPaginationAfterId: 'a',
        hasNewerPages: false,
        loading: true,
        showManualLoadOlder: false,
        showManualLoadNewer: false,
      },
    };
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: true,
      newMessages: [msg('a')],
      direction: undefined,
      cursor: undefined,
      hasNewerPagesFromApi: false,
      unreadCount: 0,
      isAtBottom: true,
    });
    expect(next).toBe(prev);
  });

  test('older direction appends', () => {
    const prev: Record<string, ConversationMessagesState> = {
      c1: {
        messages: [msg('new'), msg('old')],
        olderCursor: 'next',
        newerPaginationAfterId: 'new',
        hasNewerPages: false,
        loading: true,
        showManualLoadOlder: false,
        showManualLoadNewer: false,
      },
    };
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: false,
      newMessages: [msg('older')],
      direction: 'older',
      cursor: 'c2',
      hasNewerPagesFromApi: false,
      unreadCount: 0,
      isAtBottom: true,
    });
    expect(next.c1?.messages.map((m) => m.id)).toEqual(['new', 'old', 'older']);
    expect(next.c1?.olderCursor).toBe('c2');
  });

  test('newer direction prepends deduped', () => {
    const prev: Record<string, ConversationMessagesState> = {
      c1: {
        messages: [msg('mid')],
        olderCursor: 'oc',
        newerPaginationAfterId: 'mid',
        hasNewerPages: true,
        loading: true,
        showManualLoadOlder: false,
        showManualLoadNewer: false,
      },
    };
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: false,
      newMessages: [msg('fresh'), msg('mid')],
      direction: 'newer',
      cursor: 'oc',
      hasNewerPagesFromApi: true,
      unreadCount: 0,
      isAtBottom: true,
    });
    expect(next.c1?.messages.map((m) => m.id)).toEqual(['fresh', 'mid']);
  });

  test('initial load replaces (no direction)', () => {
    const prev: Record<string, ConversationMessagesState> = {};
    const batch = [msg('a'), msg('b')];
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: false,
      newMessages: batch,
      direction: undefined,
      cursor: 'c0',
      hasNewerPagesFromApi: false,
      unreadCount: 0,
      isAtBottom: true,
    });
    expect(next.c1?.messages).toEqual(batch);
    expect(next.c1?.olderCursor).toBe('c0');
  });

  test('forces hasNewerPages when not at bottom and merged length exceeds cap', () => {
    const many = Array.from({ length: MAX_LOADED_MESSAGES + 1 }, (_, i) => msg(`m${i}`));
    const prev: Record<string, ConversationMessagesState> = {};
    const next = applyFetchedMessagesToConversationState(prev, {
      conversationId: 'c1',
      mergeLatest: false,
      newMessages: many,
      direction: undefined,
      cursor: 'x',
      hasNewerPagesFromApi: false,
      unreadCount: 0,
      isAtBottom: false,
    });
    expect(next.c1?.hasNewerPages).toBe(true);
  });
});
