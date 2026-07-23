import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { useState } from 'react';
import { renderHook, act } from '../../test/renderHook';

const wipeCache = mock(() => {});
mock.module('../../services/messageSearch/messageSearchSessionEnd', () => ({
  endMessageSearchSessionAndWipeCache: wipeCache,
}));

const { useConversationMessageSearchSession } = await import('./useConversationMessageSearchSession');
type ConversationPane = 'settings' | 'members' | 'search' | null;

/** Drives the search-session hook alongside the parent-owned activePane state. */
function useHarness(conversationId: string) {
  const [activePane, setActivePane] = useState<ConversationPane>(null);
  const session = useConversationMessageSearchSession({
    conversationId,
    identityId: 'me',
    adminDisallowPersistentCache: false,
    activePane,
    setActivePane,
  });
  return { activePane, ...session };
}

describe('useConversationMessageSearchSession', () => {
  beforeEach(() => {
    wipeCache.mockClear();
  });

  test('first toggle starts the session and opens the search pane', async () => {
    const { result } = await renderHook(() => useHarness('c1'));

    await act(async () => {
      result.current.handleToggleMessageSearch();
    });

    expect(result.current.messageSearchSessionActive).toBe(true);
    expect(result.current.activePane).toBe('search');
    expect(wipeCache).not.toHaveBeenCalled();
  });

  test('toggling again while on the search pane wipes cache and ends the session', async () => {
    const { result } = await renderHook(() => useHarness('c1'));

    await act(async () => {
      result.current.handleToggleMessageSearch();
    });
    await act(async () => {
      result.current.handleToggleMessageSearch();
    });

    expect(wipeCache).toHaveBeenCalledTimes(1);
    expect(result.current.messageSearchSessionActive).toBe(false);
    expect(result.current.activePane).toBe(null);
  });

  test('resets the session when the conversation changes', async () => {
    const { result, rerender } = await renderHook(
      (props: { id: string }) => useHarness(props.id),
      { initialProps: { id: 'c1' } },
    );

    await act(async () => {
      result.current.handleToggleMessageSearch();
    });
    expect(result.current.messageSearchSessionActive).toBe(true);

    await rerender({ id: 'c2' });
    expect(result.current.messageSearchSessionActive).toBe(false);
    expect(result.current.activePane).toBe(null);
  });
});
