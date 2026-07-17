import { describe, expect, it, mock, beforeEach, afterEach } from 'bun:test';
import { createElement, type ReactNode } from 'react';
import { GlobalWindow } from 'happy-dom';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { ChannelMessage } from './channelMessage';
import type { UseMessageEmbedsResult } from './useMessageEmbeds';
import { MessageBody } from './MessageBody';

mock.module('../Tooltip', () => ({
  Tooltip: ({ content, children }: { content: string; children: ReactNode }) =>
    createElement('span', { 'data-tooltip': content }, children),
}));

mock.module('../../pages/conversations/MessageMediaAttachment', () => ({
  MessageMediaAttachment: ({ attachment }: { attachment: { e2eMediaId: string } }) =>
    createElement('div', { 'data-testid': `media-${attachment.e2eMediaId}` }),
}));

mock.module('../../pages/conversations/MessageGifAttachment', () => ({
  MessageGifAttachment: ({ gif }: { gif: { url: string } }) =>
    createElement('div', { 'data-testid': `gif-${gif.url}` }),
}));

mock.module('../embeds', () => ({
  MessageEmbeds: () => createElement('div', { 'data-testid': 'embeds' }),
}));

mock.module('../embeds/EnableEmbedsModal', () => ({
  EnableEmbedsModal: () => createElement('div', { 'data-testid': 'enable-embeds-modal' }),
}));

type G = typeof globalThis & {
  window?: GlobalWindow & typeof globalThis;
  document?: Document;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

let happy: GlobalWindow;
let root: Root | null = null;
let container: ReturnType<typeof happy.document.createElement>;

let savedWindow: PropertyDescriptor | undefined;
let savedDocument: PropertyDescriptor | undefined;
let savedReactActEnv: PropertyDescriptor | undefined;

beforeEach(() => {
  const g = globalThis as G;
  savedWindow = Object.getOwnPropertyDescriptor(g, 'window');
  savedDocument = Object.getOwnPropertyDescriptor(g, 'document');
  savedReactActEnv = Object.getOwnPropertyDescriptor(g, 'IS_REACT_ACT_ENVIRONMENT');

  happy = new GlobalWindow({ url: 'http://localhost' });
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
  happy.close();
  const g = globalThis as G;
  if (savedWindow) Object.defineProperty(g, 'window', savedWindow);
  else delete g.window;
  if (savedDocument) Object.defineProperty(g, 'document', savedDocument);
  else delete g.document;
  if (savedReactActEnv) Object.defineProperty(g, 'IS_REACT_ACT_ENVIRONMENT', savedReactActEnv);
  else delete g.IS_REACT_ACT_ENVIRONMENT;
});

function makeMessage(overrides: Partial<ChannelMessage> = {}): ChannelMessage {
  return {
    id: 'msg-1',
    channelId: 'ch-1',
    fromIdentityId: 'sender-1',
    createdAt: '2024-06-15T12:00:00.000Z',
    body: 'hello world',
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

function makeEmbeds(overrides: Partial<UseMessageEmbedsResult> = {}): UseMessageEmbedsResult {
  return {
    embedPreference: { mode: 'all', allowlist: [], maxWidth: 'medium' as const },
    fetchMetadata: (() => Promise.resolve(null)) as never,
    embedOverrides: {},
    hiddenEmbedMap: undefined,
    hasEmbedOverrides: false,
    hasHiddenEmbeds: false,
    showEmbedOnboarding: false,
    enableEmbedsModalOpen: false,
    setEnableEmbedsModalOpen: () => {},
    handleAddToAllowlist: () => {},
    handleEnableAllEmbeds: () => {},
    dismissEmbedOnboarding: () => {},
    ...overrides,
  };
}

function renderBody(props: Partial<Parameters<typeof MessageBody>[0]> = {}) {
  const el = createElement(MessageBody, {
    message: makeMessage(),
    renderedContent: createElement('span', null, 'rendered content'),
    hasDecryptionError: false,
    decryptionLabel: '',
    decryptionDisplayText: '',
    mediaAttachmentLayout: 'default' as const,
    gifsEnabled: true,
    gifAnimateOnHoverOnly: false,
    hideUnmoderatedMedia: false,
    embeds: makeEmbeds(),
    ...props,
  });
  act(() => {
    root = createRoot(container as unknown as HTMLElement);
    root.render(el);
  });
  return container;
}

describe('MessageBody', () => {
  it('renders "Message deleted" when deleted', () => {
    const c = renderBody({ message: makeMessage({ deleted: true }) });
    expect(c.innerHTML).toContain('Message deleted');
  });

  it('renders decryption error when hasDecryptionError is true', () => {
    const c = renderBody({
      hasDecryptionError: true,
      decryptionLabel: 'Encrypted: key missing',
      decryptionDisplayText: 'Unable to decrypt',
    });
    expect(c.innerHTML).toContain('Encrypted: key missing');
  });

  it('renders content and attachments when not deleted and no error', () => {
    const c = renderBody({
      message: makeMessage({
        attachments: [
          { e2eMediaId: 'att-1', mimeType: 'image/png', url: 'https://example.com/img.png', width: 100, height: 100 } as never,
        ],
      }),
      renderedContent: createElement('span', { 'data-testid': 'msg-content' }, 'hello'),
    });
    expect(c.innerHTML).toContain('data-testid="msg-content"');
    expect(c.innerHTML).toContain('data-testid="media-att-1"');
  });

  it('renders gif attachments', () => {
    const c = renderBody({
      message: makeMessage({
        gifAttachments: [{ url: 'https://gif.test/1.gif' } as never],
      }),
    });
    expect(c.innerHTML).toContain('data-testid="gif-https://gif.test/1.gif"');
  });

  it('renders embeds when mode is not none', () => {
    const c = renderBody({
      message: makeMessage({ body: 'https://example.com' }),
      embeds: makeEmbeds({ embedPreference: { mode: 'all', allowlist: [], maxWidth: 'medium' as const } }),
    });
    expect(c.innerHTML).toContain('data-testid="embeds"');
  });

  it('does not render embeds when mode is none and no overrides', () => {
    const c = renderBody({
      message: makeMessage({ body: 'https://example.com' }),
      embeds: makeEmbeds({
        embedPreference: { mode: 'none', allowlist: [], maxWidth: 'medium' as const },
        hasEmbedOverrides: false,
      }),
    });
    expect(c.innerHTML).not.toContain('data-testid="embeds"');
  });

  it('renders multiple attachments in grid layout', () => {
    const c = renderBody({
      message: makeMessage({
        attachments: [
          { e2eMediaId: 'att-1', mimeType: 'image/png', url: 'u1', width: 100, height: 100 } as never,
          { e2eMediaId: 'att-2', mimeType: 'image/png', url: 'u2', width: 100, height: 100 } as never,
        ],
      }),
      mediaAttachmentLayout: 'grid',
    });
    expect(c.innerHTML).toContain('dm-message-attachments');
    expect(c.innerHTML).toContain('data-testid="media-att-1"');
    expect(c.innerHTML).toContain('data-testid="media-att-2"');
  });
});
