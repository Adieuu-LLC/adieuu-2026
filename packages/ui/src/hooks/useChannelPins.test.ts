import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { useChannelPins, type ChannelPinsAdapter } from './useChannelPins';
import type { ChannelMessage } from '../components/messaging/channelMessage';

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

function makeAdapter(overrides?: Partial<ChannelPinsAdapter>): ChannelPinsAdapter {
  return {
    pinMessage: async () => true,
    unpinMessage: async () => true,
    getPinnedMessages: async () => ({ messages: [], nextCursor: null }),
    ...overrides,
  };
}

function makeMsg(id: string): ChannelMessage {
  return {
    id,
    channelId: 'ch-1',
    fromIdentityId: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    body: `Message ${id}`,
    attachments: [],
    gifAttachments: [],
    mentions: [],
    pageTags: [],
    customEmojis: {},
    deleted: false,
    revisionCount: 0,
  };
}

interface HookResult {
  pinnedMessageIds: string[];
  pinnedCount: number;
  canManagePins: boolean;
  onPin: (messageId: string) => Promise<void>;
  onUnpin: (messageId: string) => Promise<void>;
  loadPinnedMessagesPage: (
    channelId: string,
    cursor?: string | null,
  ) => Promise<{ messages: ChannelMessage[]; nextCursor: string | null } | null>;
  ingestSocketPinsUpdate: (pinIds: string[]) => void;
}

function renderHook(
  channelId: string | null,
  adapter: ChannelPinsAdapter,
  canManage = true,
): HookResult {
  const ref = {} as HookResult;
  function Harness() {
    const result = useChannelPins(channelId, adapter, canManage);
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

describe('useChannelPins', () => {
  it('starts with empty pinned state', () => {
    const ref = renderHook('ch-1', makeAdapter());
    expect(ref.pinnedMessageIds).toEqual([]);
    expect(ref.pinnedCount).toBe(0);
    expect(ref.canManagePins).toBe(true);
  });

  it('pins a message optimistically', async () => {
    const adapter = makeAdapter({ pinMessage: async () => true });
    const ref = renderHook('ch-1', adapter);

    await act(async () => {
      await ref.onPin('msg-1');
    });

    expect(ref.pinnedMessageIds).toContain('msg-1');
    expect(ref.pinnedCount).toBe(1);
  });

  it('rolls back pin on failure', async () => {
    const adapter = makeAdapter({ pinMessage: async () => false });
    const ref = renderHook('ch-1', adapter);

    await act(async () => {
      await ref.onPin('msg-1');
    });

    expect(ref.pinnedMessageIds).not.toContain('msg-1');
    expect(ref.pinnedCount).toBe(0);
  });

  it('unpins a message optimistically', async () => {
    const adapter = makeAdapter();
    const ref = renderHook('ch-1', adapter);

    await act(async () => {
      await ref.onPin('msg-1');
    });

    await act(async () => {
      await ref.onUnpin('msg-1');
    });

    expect(ref.pinnedMessageIds).not.toContain('msg-1');
    expect(ref.pinnedCount).toBe(0);
  });

  it('rolls back unpin on failure', async () => {
    const adapter = makeAdapter({
      pinMessage: async () => true,
      unpinMessage: async () => false,
    });
    const ref = renderHook('ch-1', adapter);

    await act(async () => {
      await ref.onPin('msg-1');
    });
    expect(ref.pinnedMessageIds).toContain('msg-1');

    await act(async () => {
      await ref.onUnpin('msg-1');
    });

    expect(ref.pinnedMessageIds).toContain('msg-1');
    expect(ref.pinnedCount).toBe(1);
  });

  it('loads pinned messages page', async () => {
    const pinnedMsgs = [makeMsg('pin-1'), makeMsg('pin-2')];
    const adapter = makeAdapter({
      getPinnedMessages: async () => ({
        messages: pinnedMsgs,
        nextCursor: 'cursor-2',
      }),
    });
    const ref = renderHook('ch-1', adapter);

    let result: { messages: ChannelMessage[]; nextCursor: string | null } | null = null;
    await act(async () => {
      result = await ref.loadPinnedMessagesPage('ch-1', null);
    });

    expect(result!.messages.length).toBe(2);
    expect(result!.nextCursor).toBe('cursor-2');
  });

  it('ingests socket pins update', () => {
    const adapter = makeAdapter();
    const ref = renderHook('ch-1', adapter);

    act(() => {
      ref.ingestSocketPinsUpdate(['msg-a', 'msg-b', 'msg-c']);
    });

    expect(ref.pinnedMessageIds).toEqual(['msg-a', 'msg-b', 'msg-c']);
    expect(ref.pinnedCount).toBe(3);
  });

  it('does not allow pin when canManage is false', async () => {
    let pinCalled = false;
    const adapter = makeAdapter({
      pinMessage: async () => {
        pinCalled = true;
        return true;
      },
    });
    const ref = renderHook('ch-1', adapter, false);

    await act(async () => {
      await ref.onPin('msg-1');
    });

    expect(pinCalled).toBe(false);
    expect(ref.pinnedMessageIds).toEqual([]);
  });
});
