import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { createElement } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import {
  useReplyParentHydration,
  buildChannelReplyQuote,
  type ReplyParentFetchAdapter,
  type ReplyParentInfo,
} from './useReplyParentHydration';
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

function makeMsg(id: string, opts?: Partial<ChannelMessage>): ChannelMessage {
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
    ...opts,
  };
}

interface HookResult {
  getParentInfo: (parentMessageId: string) => ReplyParentInfo | null;
  ensureHydrated: (parentMessageId: string) => Promise<void>;
  hydrateAll: (msgs: ChannelMessage[]) => void;
}

function renderHook(
  channelId: string | null,
  messages: ChannelMessage[],
  adapter: ReplyParentFetchAdapter,
): HookResult {
  const ref = {} as HookResult;
  function Harness() {
    const result = useReplyParentHydration(channelId, messages, adapter);
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

describe('useReplyParentHydration', () => {
  it('returns parent info from local messages (cache hit)', () => {
    const parent = makeMsg('parent-1', { body: 'Hello parent', fromIdentityId: 'user-a' });
    const child = makeMsg('child-1', { replyToMessageId: 'parent-1' });
    const adapter: ReplyParentFetchAdapter = { fetchMessage: async () => null };

    const ref = renderHook('ch-1', [parent, child], adapter);
    const info = ref.getParentInfo('parent-1');

    expect(info).not.toBeNull();
    expect(info!.body).toBe('Hello parent');
    expect(info!.fromIdentityId).toBe('user-a');
    expect(info!.deleted).toBe(false);
  });

  it('fetches parent via adapter when not in local messages', async () => {
    const fetched = makeMsg('parent-remote', {
      body: 'Remote parent body',
      fromIdentityId: 'user-remote',
    });
    const adapter: ReplyParentFetchAdapter = {
      fetchMessage: async () => fetched,
    };
    const child = makeMsg('child-1', { replyToMessageId: 'parent-remote' });

    const ref = renderHook('ch-1', [child], adapter);

    expect(ref.getParentInfo('parent-remote')).toBeNull();

    await act(async () => {
      await ref.ensureHydrated('parent-remote');
    });

    const info = ref.getParentInfo('parent-remote');
    expect(info).not.toBeNull();
    expect(info!.body).toBe('Remote parent body');
    expect(info!.fromIdentityId).toBe('user-remote');
  });

  it('deduplicates concurrent fetch requests', async () => {
    let fetchCount = 0;
    const fetched = makeMsg('parent-dedup', { body: 'Dedup body' });
    const adapter: ReplyParentFetchAdapter = {
      fetchMessage: async () => {
        fetchCount++;
        await new Promise((r) => setTimeout(r, 50));
        return fetched;
      },
    };
    const child = makeMsg('child-1', { replyToMessageId: 'parent-dedup' });
    const ref = renderHook('ch-1', [child], adapter);

    await act(async () => {
      ref.ensureHydrated('parent-dedup');
      ref.ensureHydrated('parent-dedup');
      ref.ensureHydrated('parent-dedup');
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(fetchCount).toBe(1);
  });

  it('handles fetch error gracefully', async () => {
    const adapter: ReplyParentFetchAdapter = {
      fetchMessage: async () => null,
    };
    const child = makeMsg('child-1', { replyToMessageId: 'missing-parent' });
    const ref = renderHook('ch-1', [child], adapter);

    await act(async () => {
      await ref.ensureHydrated('missing-parent');
    });

    expect(ref.getParentInfo('missing-parent')).toBeNull();
  });

  it('hydrateAll triggers fetch for messages with replyToMessageId', async () => {
    const fetched = makeMsg('parent-all', { body: 'Batch body' });
    let fetchedIds: string[] = [];
    const adapter: ReplyParentFetchAdapter = {
      fetchMessage: async (_cid, msgId) => {
        fetchedIds.push(msgId);
        return fetched;
      },
    };
    const child1 = makeMsg('c1', { replyToMessageId: 'parent-all' });
    const child2 = makeMsg('c2');
    const ref = renderHook('ch-1', [child1, child2], adapter);

    await act(async () => {
      ref.hydrateAll([child1, child2]);
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(fetchedIds).toContain('parent-all');
    expect(fetchedIds.length).toBe(1);
  });
});

describe('buildChannelReplyQuote', () => {
  it('returns fallback when parentInfo is null', () => {
    const quote = buildChannelReplyQuote(
      null,
      () => 'Unknown',
      () => undefined,
      () => {},
      'Deleted',
      'Original message',
    );
    expect(quote).not.toBeNull();
    expect(quote!.text).toBe('Original message');
  });

  it('returns deleted label when parent is deleted', () => {
    const info: ReplyParentInfo = {
      body: 'some text',
      fromIdentityId: 'user-1',
      deleted: true,
    };
    const quote = buildChannelReplyQuote(
      info,
      () => 'Author',
      () => undefined,
      () => {},
      'Deleted',
      'Fallback',
    );
    expect(quote!.text).toBe('Deleted');
  });

  it('truncates long reply text to 6 words', () => {
    const info: ReplyParentInfo = {
      body: 'one two three four five six seven eight',
      fromIdentityId: 'user-1',
      deleted: false,
    };
    const quote = buildChannelReplyQuote(
      info,
      () => 'Author',
      () => 'avatar.jpg',
      () => {},
      'Deleted',
      'Fallback',
    );
    expect(quote!.text).toBe('one two three four five six…');
    expect(quote!.quotedAuthor?.displayName).toBe('Author');
    expect(quote!.quotedAuthor?.avatarUrl).toBe('avatar.jpg');
  });

  it('uses full text when 6 words or fewer', () => {
    const info: ReplyParentInfo = {
      body: 'short reply text',
      fromIdentityId: 'user-1',
      deleted: false,
    };
    const quote = buildChannelReplyQuote(
      info,
      () => 'Someone',
      () => undefined,
      () => {},
      'Deleted',
      'Fallback',
    );
    expect(quote!.text).toBe('short reply text');
  });
});
