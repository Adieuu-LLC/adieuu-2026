import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { createElement } from 'react';
import { useState } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { PublicSpaceMessage } from '@adieuu/shared';
import { useSpaceDataFetching, type SpaceDataFetchingParams } from './useSpaceDataFetching';
import { MAX_SPACE_LOADED_MESSAGES } from './spaceScrollUtils';
import type { SpaceChannelMessagesState } from './types';

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;

beforeEach(() => {
  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  const g = globalThis as G;
  delete g.window;
  delete g.document;
  delete g.IS_REACT_ACT_ENVIRONMENT;
});

const SPACE_ID = 'space-1';
const CHANNEL_ID = 'ch-1';

function makeMsg(id: string, createdAt: string): PublicSpaceMessage {
  return {
    id,
    spaceId: SPACE_ID,
    channelId: CHANNEL_ID,
    fromIdentityId: 'user-1',
    content: `msg ${id}`,
    clientMessageId: `client-${id}`,
    deleted: false,
    revisionCount: 0,
    createdAt,
  };
}

type GetMessagesResult = {
  success: boolean;
  data?: { messages: PublicSpaceMessage[]; cursor: string | null; hasNewerPages?: boolean };
};

interface Harness {
  fetchChannelMessages: (
    spaceId: string,
    channelId: string,
    cursor?: string,
    options?: { mergeLatest?: boolean; direction?: 'older' | 'newer' },
  ) => Promise<void>;
  refreshChannelMessages: (spaceId: string, channelId: string) => void;
  fetchMessagesAround: (
    spaceId: string,
    channelId: string,
    messageId: string,
    options?: { before?: number; after?: number },
  ) => Promise<PublicSpaceMessage[] | null>;
  state: Record<string, SpaceChannelMessagesState>;
}

const noop = () => {};

function renderDataHook(api: SpaceDataFetchingParams['api']): Harness {
  const ref = {} as Harness;
  function HookHarness() {
    const [messagesByChannel, setMessagesByChannel] =
      useState<Record<string, SpaceChannelMessagesState>>({});
    const hook = useSpaceDataFetching({
      api,
      isLoggedIn: true,
      setSpaces: noop as SpaceDataFetchingParams['setSpaces'],
      setSpacesLoading: noop as SpaceDataFetchingParams['setSpacesLoading'],
      setActiveSpace: noop as SpaceDataFetchingParams['setActiveSpace'],
      setActiveSpaceLoading: noop as SpaceDataFetchingParams['setActiveSpaceLoading'],
      setActiveSpaceError: noop as SpaceDataFetchingParams['setActiveSpaceError'],
      setChannels: noop as SpaceDataFetchingParams['setChannels'],
      setCategories: noop as SpaceDataFetchingParams['setCategories'],
      setMessagesByChannel,
    });
    Object.assign(ref, hook);
    ref.state = messagesByChannel;
    return null;
  }
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(HookHarness));
  });
  return ref;
}

describe('useSpaceDataFetching.fetchChannelMessages', () => {
  it('omits direction on the initial (cursor-less) load and replaces the window', async () => {
    const getMessages = mock(
      async (): Promise<GetMessagesResult> => ({
        success: true,
        data: { messages: [makeMsg('m2', '2024-01-02T00:00:00Z'), makeMsg('m1', '2024-01-01T00:00:00Z')], cursor: 'cursor-1' },
      }),
    );
    const api = { spaces: { getMessages, getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })) } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });

    const opts = getMessages.mock.calls[0]![2] as { cursor?: string; direction?: string };
    expect(opts.cursor).toBeUndefined();
    expect(opts.direction).toBeUndefined();
    expect(ref.state[CHANNEL_ID]!.messages.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(ref.state[CHANNEL_ID]!.olderCursor).toBe('cursor-1');
    expect(ref.state[CHANNEL_ID]!.loading).toBe(false);
  });

  it("sends direction:'asc' when a cursor is present and appends older messages", async () => {
    const getMessages = mock(
      async (_s: string, _c: string, options?: { cursor?: string }): Promise<GetMessagesResult> => {
        if (!options?.cursor) {
          return { success: true, data: { messages: [makeMsg('m2', '2024-01-02T00:00:00Z')], cursor: 'cursor-1' } };
        }
        return { success: true, data: { messages: [makeMsg('m1', '2024-01-01T00:00:00Z')], cursor: 'cursor-2' } };
      },
    );
    const api = { spaces: { getMessages, getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })) } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });
    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID, 'cursor-1');
    });

    const olderOpts = getMessages.mock.calls[1]![2] as { cursor?: string; direction?: string };
    expect(olderOpts.cursor).toBe('cursor-1');
    expect(olderOpts.direction).toBe('asc');
    expect(ref.state[CHANNEL_ID]!.messages.map((m) => m.id)).toEqual(['m2', 'm1']);
    expect(ref.state[CHANNEL_ID]!.olderCursor).toBe('cursor-2');
  });

  it("direction:'newer' sends direction:'desc', prepends the newer page, and keeps the older cursor", async () => {
    const getMessages = mock(
      async (_s: string, _c: string, options?: { cursor?: string }): Promise<GetMessagesResult> => {
        if (!options?.cursor) {
          return {
            success: true,
            data: {
              messages: [makeMsg('m2', '2024-01-02T00:00:00Z'), makeMsg('m1', '2024-01-01T00:00:00Z')],
              cursor: 'cursor-1',
              hasNewerPages: false,
            },
          };
        }
        // Newer page (already newest-first from the API), plus a flag that more remain.
        return {
          success: true,
          data: {
            messages: [makeMsg('m4', '2024-01-04T00:00:00Z'), makeMsg('m3', '2024-01-03T00:00:00Z')],
            cursor: null,
            hasNewerPages: true,
          },
        };
      },
    );
    const api = { spaces: { getMessages, getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })) } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });
    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID, 'm2', { direction: 'newer' });
    });

    const newerOpts = getMessages.mock.calls[1]![2] as { cursor?: string; direction?: string };
    expect(newerOpts.cursor).toBe('m2');
    expect(newerOpts.direction).toBe('desc');
    // Newer page splices above the existing head; order stays newest-first.
    expect(ref.state[CHANNEL_ID]!.messages.map((m) => m.id)).toEqual(['m4', 'm3', 'm2', 'm1']);
    // A newer fetch never advances the older cursor, and carries the flag through.
    expect(ref.state[CHANNEL_ID]!.olderCursor).toBe('cursor-1');
    expect(ref.state[CHANNEL_ID]!.hasNewerPages).toBe(true);
  });

  it('hard-caps the buffer at MAX_SPACE_LOADED_MESSAGES while paging older, keeping the oldest window', async () => {
    let nextId = 1000;
    const getMessages = mock(
      async (_s: string, _c: string, options?: { cursor?: string }): Promise<GetMessagesResult> => {
        // Each page is 30 messages, newest-first, older than any prior page.
        const page: PublicSpaceMessage[] = [];
        for (let i = 0; i < 30; i++) {
          const id = `m${nextId--}`;
          page.push(makeMsg(id, `2024-01-01T00:00:${String(i).padStart(2, '0')}Z`));
        }
        return { success: true, data: { messages: page, cursor: `cursor-${nextId}`, hasNewerPages: !!options?.cursor } };
      },
    );
    const api = { spaces: { getMessages, getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })) } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    // Initial load, then keep paging older well past the cap.
    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });
    for (let p = 0; p < 6; p++) {
      const cursor = ref.state[CHANNEL_ID]!.olderCursor!;
      await act(async () => {
        await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID, cursor, { direction: 'older' });
      });
    }

    const buffer = ref.state[CHANNEL_ID]!.messages;
    // Never overshoots the cap (no transient "cap + one page").
    expect(buffer.length).toBe(MAX_SPACE_LOADED_MESSAGES);
    // Kept the oldest window: the buffer tail is the most recently fetched (oldest) id.
    expect(buffer[buffer.length - 1]!.id).toBe(`m${nextId + 1}`);
    // Evicting the newest end means newer pages now exist.
    expect(ref.state[CHANNEL_ID]!.hasNewerPages).toBe(true);
  });

  it('clears the loading flag on a non-success response', async () => {
    const getMessages = mock(async (): Promise<GetMessagesResult> => ({ success: false }));
    const api = { spaces: { getMessages, getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })) } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });

    expect(ref.state[CHANNEL_ID]!.loading).toBe(false);
  });

  it('merge-latest preserves already-loaded older history and its cursor', async () => {
    const getMessages = mock(
      async (_s: string, _c: string, options?: { cursor?: string }): Promise<GetMessagesResult> => {
        if (!options?.cursor) {
          // Initial + refresh both return the newest page.
          return { success: true, data: { messages: [makeMsg('m3', '2024-01-03T00:00:00Z'), makeMsg('m2', '2024-01-02T00:00:00Z')], cursor: 'cursor-1' } };
        }
        return { success: true, data: { messages: [makeMsg('m1', '2024-01-01T00:00:00Z')], cursor: 'cursor-2' } };
      },
    );
    const api = { spaces: { getMessages, getMessagesAround: mock(async () => ({ success: true, data: { messages: [], cursor: null } })) } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });
    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID, 'cursor-1');
    });
    // Sanity: older page loaded.
    expect(ref.state[CHANNEL_ID]!.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(ref.state[CHANNEL_ID]!.olderCursor).toBe('cursor-2');

    await act(async () => {
      ref.refreshChannelMessages(SPACE_ID, CHANNEL_ID);
      await new Promise((r) => setTimeout(r, 0));
    });

    // History (m1) survives the refresh, and the older cursor is preserved.
    expect(ref.state[CHANNEL_ID]!.messages.map((m) => m.id)).toEqual(['m3', 'm2', 'm1']);
    expect(ref.state[CHANNEL_ID]!.olderCursor).toBe('cursor-2');
  });
});

describe('useSpaceDataFetching.fetchMessagesAround', () => {
  it('merges the fetched window newest-first and de-duplicates', async () => {
    const getMessages = mock(
      async (): Promise<GetMessagesResult> => ({
        success: true,
        data: { messages: [makeMsg('m5', '2024-01-05T00:00:00Z'), makeMsg('m4', '2024-01-04T00:00:00Z')], cursor: 'cursor-1' },
      }),
    );
    const getMessagesAround = mock(async () => ({
      success: true,
      data: {
        messages: [makeMsg('m4', '2024-01-04T00:00:00Z'), makeMsg('m2', '2024-01-02T00:00:00Z'), makeMsg('m1', '2024-01-01T00:00:00Z')],
        cursor: null,
      },
    }));
    const api = { spaces: { getMessages, getMessagesAround } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });
    await act(async () => {
      await ref.fetchMessagesAround(SPACE_ID, CHANNEL_ID, 'm1');
    });

    // m4 appears once; final order is strictly newest-first by createdAt.
    expect(ref.state[CHANNEL_ID]!.messages.map((m) => m.id)).toEqual(['m5', 'm4', 'm2', 'm1']);
    // Existing older cursor is preserved (pagination continues from the tail).
    expect(ref.state[CHANNEL_ID]!.olderCursor).toBe('cursor-1');
  });

  it('marks the buffer detached (hasNewerPages) from the around response', async () => {
    const getMessages = mock(
      async (): Promise<GetMessagesResult> => ({
        success: true,
        data: { messages: [makeMsg('m5', '2024-01-05T00:00:00Z')], cursor: 'cursor-1', hasNewerPages: false },
      }),
    );
    // Jumping to a historical target: the around window does not reach the tip.
    const getMessagesAround = mock(async () => ({
      success: true,
      data: {
        messages: [makeMsg('m2', '2024-01-02T00:00:00Z'), makeMsg('m1', '2024-01-01T00:00:00Z')],
        cursor: null,
        hasNewerPages: true,
      },
    }));
    const api = { spaces: { getMessages, getMessagesAround } } as unknown as SpaceDataFetchingParams['api'];
    const ref = renderDataHook(api);

    await act(async () => {
      await ref.fetchChannelMessages(SPACE_ID, CHANNEL_ID);
    });
    // Sanity: the initial window is at the tip.
    expect(ref.state[CHANNEL_ID]!.hasNewerPages).toBe(false);

    await act(async () => {
      await ref.fetchMessagesAround(SPACE_ID, CHANNEL_ID, 'm1');
    });

    // The around response flags newer pages, so the merged buffer is detached
    // (jump-to-latest must reload rather than treat it as the live tip).
    expect(ref.state[CHANNEL_ID]!.hasNewerPages).toBe(true);
  });
});
