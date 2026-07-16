import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { ChannelMessage } from './channelMessage';
import { MessageMetaStrip, type MessageMetaStripProps } from './MessageMetaStrip';

mock.module('../Tooltip', () => ({
  Tooltip: ({ content, children }: { content: string; children: ReactNode }) =>
    createElement('span', { 'data-tooltip': content }, children),
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name, size }: { name: string; size?: string }) =>
    createElement('span', { 'data-icon': name, 'data-size': size }),
}));

mock.module('../../pages/conversations/conversationUtils', () => ({
  formatMessageTime: (ts: string) => `time:${ts}`,
  formatAbsoluteTime: (ts: string) => `abs:${ts}`,
  resolveDisplayName: () => 'User',
}));

mock.module('../../pages/conversations/MessageEditHistoryLabel', () => ({
  MessageEditHistoryLabel: ({ className }: { className: string }) =>
    createElement('span', { className, 'data-testid': 'edit-history-label' }, 'edit history'),
}));

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;
let container: ReturnType<typeof happy.document.createElement>;

beforeEach(() => {
  happy = new GlobalWindow({ url: 'http://localhost' });
  const g = globalThis as G;
  g.window = happy as unknown as typeof g.window;
  g.document = happy.document as unknown as Document;
  g.IS_REACT_ACT_ENVIRONMENT = true;
  container = happy.document.createElement('div');
  happy.document.body.appendChild(container);
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

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    fromIdentityId: 'sender-1',
    createdAt: '2024-06-15T12:00:00.000Z',
    body: 'hello',
    attachments: [],
    gifAttachments: [],
    mentions: [],
    pageTags: [],
    customEmojis: {},
    deleted: false,
    revisionCount: 0,
    ...overrides,
  };
}

function renderStrip(overrides: Partial<MessageMetaStripProps> = {}) {
  const props: MessageMetaStripProps = {
    message: makeMessage(),
    deviceSignatureTrustIcon: null,
    signatureWarningIcon: null,
    fsDowngradeIcon: null,
    isPinned: false,
    countdown: null,
    variant: 'header',
    ...overrides,
  };
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(createElement(MessageMetaStrip, props));
  });
  return container;
}

describe('MessageMetaStrip', () => {
  it('renders timestamp in footer variant', () => {
    const c = renderStrip({ variant: 'footer' });
    expect(c.innerHTML).toContain('time:2024-06-15T12:00:00.000Z');
  });

  it('does not render timestamp in header variant', () => {
    const c = renderStrip({ variant: 'header' });
    expect(c.innerHTML).not.toContain('time:2024-06-15T12:00:00.000Z');
  });

  it('shows edited label when revisionCount > 0 without _sourceConversation', () => {
    const c = renderStrip({
      message: makeMessage({ revisionCount: 1 }),
    });
    expect(c.innerHTML).toContain('conversations.messageEdited');
  });

  it('shows MessageEditHistoryLabel when _sourceConversation is present', () => {
    const c = renderStrip({
      message: makeMessage({ revisionCount: 2, _sourceConversation: {} as never }),
    });
    expect(c.innerHTML).toContain('data-testid="edit-history-label"');
  });

  it('does not show edited label when revisionCount is 0', () => {
    const c = renderStrip({
      message: makeMessage({ revisionCount: 0 }),
    });
    expect(c.innerHTML).not.toContain('dm-message-edited-label');
  });

  it('shows pin indicator when isPinned', () => {
    const c = renderStrip({ isPinned: true });
    expect(c.innerHTML).toContain('dm-message-pin-indicator');
  });

  it('does not show pin indicator when not pinned', () => {
    const c = renderStrip({ isPinned: false });
    expect(c.innerHTML).not.toContain('dm-message-pin-indicator');
  });

  it('shows forward secrecy indicator when fsInfo and forwardSecrecy are set', () => {
    const c = renderStrip({
      message: makeMessage({ forwardSecrecy: true }),
      fsInfo: { rotationLabel: '1h', readableWindow: '1 hour', tooltip: 'FS tooltip' },
    });
    expect(c.innerHTML).toContain('dm-message-fs-indicator--active');
    expect(c.innerHTML).toContain('FS 1 hour');
  });

  it('shows inactive FS indicator when forwardSecrecy is false', () => {
    const c = renderStrip({
      message: makeMessage({ forwardSecrecy: false }),
      fsInfo: { rotationLabel: '1h', readableWindow: '1 hour', tooltip: 'FS tooltip' },
    });
    expect(c.innerHTML).toContain('dm-message-fs-indicator');
    expect(c.innerHTML).not.toContain('dm-message-fs-indicator--active');
  });

  it('does not show FS indicator when fsInfo is absent', () => {
    const c = renderStrip({
      message: makeMessage({ forwardSecrecy: true }),
    });
    expect(c.innerHTML).not.toContain('dm-message-fs-indicator');
  });

  it('shows countdown when provided', () => {
    const c = renderStrip({ countdown: '5m' });
    expect(c.innerHTML).toContain('5m');
    expect(c.innerHTML).toContain('dm-message-expiry');
  });

  it('does not show countdown when null', () => {
    const c = renderStrip({ countdown: null });
    expect(c.innerHTML).not.toContain('dm-message-expiry');
  });

  it('renders device trust icon when provided', () => {
    const icon = createElement('span', { 'data-testid': 'trust-icon' }, 'trusted');
    const c = renderStrip({ deviceSignatureTrustIcon: icon });
    expect(c.innerHTML).toContain('data-testid="trust-icon"');
  });

  it('renders signature warning icon when provided', () => {
    const icon = createElement('span', { 'data-testid': 'sig-warn' }, 'warning');
    const c = renderStrip({ signatureWarningIcon: icon });
    expect(c.innerHTML).toContain('data-testid="sig-warn"');
  });

  it('renders fsDowngrade icon when provided', () => {
    const icon = createElement('span', { 'data-testid': 'fs-down' }, 'downgrade');
    const c = renderStrip({ fsDowngradeIcon: icon });
    expect(c.innerHTML).toContain('data-testid="fs-down"');
  });
});
