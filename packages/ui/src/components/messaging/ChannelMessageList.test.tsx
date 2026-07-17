import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { createElement } from 'react';
import { act } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot } from 'react-dom/client';
import { resetReactI18nextMock, setMockTranslate } from '../../test/react-i18next-mock';
import '../../test/react-router-dom-mock';
import type { ChannelMessage } from './channelMessage';
import type { ChannelListItem } from '../../utils/buildFlatMessageItems';

setMockTranslate((key) => key);

mock.module('../Tooltip', () => ({
  Tooltip: ({ children }: { children: import('react').ReactElement }) => children,
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

mock.module('./ChannelMessageBubble', () => ({
  ChannelMessageBubble: ({ message }: { message: ChannelMessage }) =>
    createElement('div', { 'data-testid': `bubble-${message.id}` }, message.body),
}));

const { ChannelMessageList } = await import('./ChannelMessageList');

type G = typeof globalThis & {
  window?: import('happy-dom').GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: import('happy-dom').GlobalWindow;
let prevWindow: typeof globalThis.window;
let prevDocument: typeof globalThis.document;
let prevRaf: typeof globalThis.requestAnimationFrame;
let prevIO: unknown;
let prevRO: unknown;
let hadIO: boolean;
let hadRO: boolean;

function makeChannelMessage(
  id: string,
  body: string,
  createdAt = '2024-06-15T10:00:00Z',
): ChannelMessage {
  return {
    id,
    channelId: 'ch-1',
    fromIdentityId: 'sender-1',
    createdAt,
    body,
    attachments: [],
    gifAttachments: [],
    mentions: [],
    pageTags: [],
    customEmojis: {},
    deleted: false,
    revisionCount: 0,
  };
}

function makeFlatItems(
  messages: ChannelMessage[],
): ChannelListItem<ChannelMessage>[] {
  const items: ChannelListItem<ChannelMessage>[] = [];
  for (const msg of messages) {
    items.push({
      type: 'day-separator',
      date: new Date(msg.createdAt),
      key: `day-${msg.id}`,
    });
    items.push({ type: 'message', msg, key: msg.id });
  }
  return items;
}

const noopFn = () => {};
const asyncNoopFn = async () => {};

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    entityId: 'ch-1',
    activeEntityId: 'ch-1',
    flatItems: [] as ChannelListItem<ChannelMessage>[],
    messagesLoading: false,
    messageCount: 0,
    identity: { id: 'self-1' },
    participantProfiles: {},
    memberSettings: {},
    messageLayout: 'bubble' as const,
    memberColorDisplay: 'name-only' as const,
    favoriteEmojis: [],
    getGroupedReactions: () => [],
    onDeleteMessage: noopFn,
    onReact: noopFn,
    onToggleReaction: noopFn,
    onReportMessage: noopFn,
    onAddFavorite: noopFn,
    onRemoveFavorite: noopFn,
    onLinkClick: noopFn,
    showScrollButton: false,
    onJumpToLatest: asyncNoopFn,
    scrollViewportRef: { current: null },
    messagesContentRef: { current: null },
    messagesContainerRef: { current: null },
    onScrollViewportScroll: noopFn,
    onUserScrollIntent: noopFn,
    cachedScrollIndex: null,
    hasMoreOlder: false,
    onReachOlder: noopFn,
    hasNewerPages: false,
    onReachNewer: noopFn,
    ...overrides,
  };
}

class StubIO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class StubRO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  resetReactI18nextMock();
  setMockTranslate((key) => key);

  const g = globalThis as G;
  prevWindow = g.window;
  prevDocument = g.document;
  prevRaf = g.requestAnimationFrame;
  happy = new GlobalWindow({ url: 'https://example.test/' });
  g.IS_REACT_ACT_ENVIRONMENT = true;
  g.window = happy as unknown as import('happy-dom').GlobalWindow & typeof globalThis;
  g.document = happy.document;
  g.requestAnimationFrame = happy.requestAnimationFrame.bind(happy);
  hadIO = 'IntersectionObserver' in g;
  hadRO = 'ResizeObserver' in g;
  prevIO = (g as any).IntersectionObserver;
  prevRO = (g as any).ResizeObserver;
  (g as any).IntersectionObserver = StubIO;
  (g as any).ResizeObserver = StubRO;
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  happy?.close();
  const g = globalThis as G;
  delete g.IS_REACT_ACT_ENVIRONMENT;
  g.window = prevWindow;
  g.document = prevDocument;
  g.requestAnimationFrame = prevRaf;
  if (hadIO) (g as any).IntersectionObserver = prevIO;
  else delete (g as any).IntersectionObserver;
  if (hadRO) (g as any).ResizeObserver = prevRO;
  else delete (g as any).ResizeObserver;
});

async function render(props: Record<string, unknown> = {}) {
  const container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(ChannelMessageList, defaultProps(props) as any));
    await new Promise((r) => setTimeout(r, 0));
  });
  return { root, container };
}

describe('ChannelMessageList', () => {
  it('shows empty state when no messages', async () => {
    const { root, container } = await render();
    expect(happy.document.body.textContent).toContain('conversations.noMessages');

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows loading spinner when loading with no messages', async () => {
    const { root, container } = await render({
      messagesLoading: true,
      messageCount: 0,
    });
    const spinner = happy.document.querySelector('.dm-messages-spinner');
    expect(spinner).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders messages via ChannelMessageBubble', async () => {
    const messages = [makeChannelMessage('m1', 'Hello'), makeChannelMessage('m2', 'World')];
    const items = makeFlatItems(messages);

    const { root, container } = await render({
      flatItems: items,
      messageCount: 2,
    });
    const bubble1 = happy.document.querySelector('[data-testid="bubble-m1"]');
    const bubble2 = happy.document.querySelector('[data-testid="bubble-m2"]');
    expect(bubble1).not.toBeNull();
    expect(bubble2).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('renders day separators', async () => {
    const messages = [makeChannelMessage('m1', 'Hello')];
    const items = makeFlatItems(messages);

    const { root, container } = await render({
      flatItems: items,
      messageCount: 1,
    });
    const sep = happy.document.querySelector('.dm-day-separator');
    expect(sep).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows jump-to-latest button when showScrollButton is true', async () => {
    const messages = [makeChannelMessage('m1', 'Hello')];
    const items = makeFlatItems(messages);

    const { root, container } = await render({
      flatItems: items,
      messageCount: 1,
      showScrollButton: true,
    });
    const btn = happy.document.querySelector('.conversation-scroll-to-bottom--visible');
    expect(btn).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('shows custom empty message', async () => {
    const { root, container } = await render({
      emptyMessage: 'No messages in this channel',
    });
    expect(happy.document.body.textContent).toContain('No messages in this channel');

    await act(async () => root.unmount());
    container.remove();
  });
});
