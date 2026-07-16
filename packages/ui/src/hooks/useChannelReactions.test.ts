import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  useChannelReactions,
  type ChannelReactionsAdapter,
  type ChannelReaction,
  type GroupedReaction,
} from './useChannelReactions';

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

function makeAdapter(overrides?: Partial<ChannelReactionsAdapter>): ChannelReactionsAdapter {
  return {
    addReaction: async () => null,
    removeReaction: async () => true,
    getReactions: async () => [],
    ...overrides,
  };
}

interface HookResult {
  getGroupedReactions: (id: string) => GroupedReaction[];
  onReact: (messageId: string, emoji: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string, ownReactionId?: string) => void;
  fetchReactions: (messageIds: string[]) => Promise<void>;
  ingestSocketReaction: (reaction: ChannelReaction) => void;
  ingestSocketReactionRemoval: (messageId: string, reactionId: string) => void;
  loading: boolean;
}

function renderHook(
  channelId: string | null,
  adapter: ChannelReactionsAdapter,
  selfId?: string,
): HookResult {
  const ref = {} as HookResult;
  function Harness() {
    const result = useChannelReactions(channelId, adapter, selfId);
    Object.assign(ref, result);
    return null;
  }
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(Harness));
  });
  return ref;
}

describe('useChannelReactions', () => {
  it('starts with empty state', () => {
    const ref = renderHook('ch-1', makeAdapter(), 'user-1');
    expect(ref.getGroupedReactions('msg-1')).toEqual([]);
    expect(ref.loading).toBe(false);
  });

  it('adds a reaction optimistically', async () => {
    const added: ChannelReaction = {
      id: 'r-1',
      messageId: 'msg-1',
      channelId: 'ch-1',
      fromIdentityId: 'user-1',
      emoji: '👍',
      createdAt: '2024-01-01T00:00:00Z',
    };
    const adapter = makeAdapter({
      addReaction: async () => added,
    });
    const ref = renderHook('ch-1', adapter, 'user-1');

    await act(async () => {
      await ref.onReact('msg-1', '👍');
    });

    const groups = ref.getGroupedReactions('msg-1');
    expect(groups.length).toBe(1);
    expect(groups[0]!.emoji).toBe('👍');
    expect(groups[0]!.count).toBe(1);
    expect(groups[0]!.isOwn).toBe(true);
  });

  it('removes a reaction via adapter', async () => {
    const reactions: ChannelReaction[] = [
      {
        id: 'r-1',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-1',
        emoji: '👍',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];
    const adapter = makeAdapter({
      getReactions: async () => reactions,
      removeReaction: async () => true,
    });
    const ref = renderHook('ch-1', adapter, 'user-1');

    await act(async () => {
      await ref.fetchReactions(['msg-1']);
    });

    expect(ref.getGroupedReactions('msg-1').length).toBe(1);

    await act(async () => {
      ref.onToggleReaction('msg-1', '👍', 'r-1');
      await new Promise((r) => setTimeout(r, 10));
    });

    expect(ref.getGroupedReactions('msg-1').length).toBe(0);
  });

  it('toggle adds when no own reaction exists', async () => {
    const added: ChannelReaction = {
      id: 'r-new',
      messageId: 'msg-1',
      channelId: 'ch-1',
      fromIdentityId: 'user-1',
      emoji: '🎉',
      createdAt: '2024-01-01T00:00:00Z',
    };
    const adapter = makeAdapter({ addReaction: async () => added });
    const ref = renderHook('ch-1', adapter, 'user-1');

    await act(async () => {
      ref.onToggleReaction('msg-1', '🎉', undefined);
      await new Promise((r) => setTimeout(r, 10));
    });

    const groups = ref.getGroupedReactions('msg-1');
    expect(groups.length).toBe(1);
    expect(groups[0]!.emoji).toBe('🎉');
  });

  it('fetches reactions from adapter', async () => {
    const reactions: ChannelReaction[] = [
      {
        id: 'r-1',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-2',
        emoji: '❤️',
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'r-2',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-3',
        emoji: '❤️',
        createdAt: '2024-01-01T00:01:00Z',
      },
    ];
    const adapter = makeAdapter({ getReactions: async () => reactions });
    const ref = renderHook('ch-1', adapter, 'user-1');

    await act(async () => {
      await ref.fetchReactions(['msg-1']);
    });

    const groups = ref.getGroupedReactions('msg-1');
    expect(groups.length).toBe(1);
    expect(groups[0]!.emoji).toBe('❤️');
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.isOwn).toBe(false);
  });

  it('ingests socket reaction', () => {
    const adapter = makeAdapter();
    const ref = renderHook('ch-1', adapter, 'user-1');

    act(() => {
      ref.ingestSocketReaction({
        id: 'r-socket',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-2',
        emoji: '🔥',
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    const groups = ref.getGroupedReactions('msg-1');
    expect(groups.length).toBe(1);
    expect(groups[0]!.emoji).toBe('🔥');
  });

  it('deduplicates socket reaction with same id', () => {
    const adapter = makeAdapter();
    const ref = renderHook('ch-1', adapter, 'user-1');

    act(() => {
      ref.ingestSocketReaction({
        id: 'r-dup',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-2',
        emoji: '🔥',
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    act(() => {
      ref.ingestSocketReaction({
        id: 'r-dup',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-2',
        emoji: '🔥',
        createdAt: '2024-01-01T00:00:00Z',
      });
    });

    expect(ref.getGroupedReactions('msg-1')[0]!.count).toBe(1);
  });

  it('ingests socket reaction removal', async () => {
    const reactions: ChannelReaction[] = [
      {
        id: 'r-1',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-2',
        emoji: '😊',
        createdAt: '2024-01-01T00:00:00Z',
      },
    ];
    const adapter = makeAdapter({ getReactions: async () => reactions });
    const ref = renderHook('ch-1', adapter, 'user-1');

    await act(async () => {
      await ref.fetchReactions(['msg-1']);
    });

    expect(ref.getGroupedReactions('msg-1').length).toBe(1);

    act(() => {
      ref.ingestSocketReactionRemoval('msg-1', 'r-1');
    });

    expect(ref.getGroupedReactions('msg-1').length).toBe(0);
  });

  it('groups reactions correctly', async () => {
    const reactions: ChannelReaction[] = [
      {
        id: 'r-1',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-1',
        emoji: '👍',
        createdAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'r-2',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-2',
        emoji: '👍',
        createdAt: '2024-01-01T00:01:00Z',
      },
      {
        id: 'r-3',
        messageId: 'msg-1',
        channelId: 'ch-1',
        fromIdentityId: 'user-3',
        emoji: '❤️',
        createdAt: '2024-01-01T00:02:00Z',
      },
    ];
    const adapter = makeAdapter({ getReactions: async () => reactions });
    const ref = renderHook('ch-1', adapter, 'user-1');

    await act(async () => {
      await ref.fetchReactions(['msg-1']);
    });

    const groups = ref.getGroupedReactions('msg-1');
    expect(groups.length).toBe(2);
    const thumbs = groups.find((g) => g.emoji === '👍');
    const heart = groups.find((g) => g.emoji === '❤️');
    expect(thumbs!.count).toBe(2);
    expect(thumbs!.isOwn).toBe(true);
    expect(thumbs!.ownReactionId).toBe('r-1');
    expect(heart!.count).toBe(1);
    expect(heart!.isOwn).toBe(false);
  });
});
