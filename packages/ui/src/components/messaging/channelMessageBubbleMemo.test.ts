import { describe, expect, it } from 'bun:test';
import type { ChannelMessageBubbleProps } from './ChannelMessageBubble';
import type { ChannelMessage } from './channelMessage';
import { areChannelMessageBubblePropsEqual } from './channelMessageBubbleMemo';

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

const noop = () => {};
const SHARED_MESSAGE = makeMessage();
const SHARED_PROFILES: Record<string, never> = {};
const SHARED_MEMBER_SETTINGS = {};
const SHARED_FAVORITES = ['👍', '❤️'];
const SHARED_REACTIONS: never[] = [];

function makeProps(overrides: Partial<ChannelMessageBubbleProps> = {}): ChannelMessageBubbleProps {
  return {
    message: SHARED_MESSAGE,
    isOwn: false,
    onDelete: noop,
    onReact: noop,
    onToggleReaction: noop,
    onReport: noop,
    groupedReactions: SHARED_REACTIONS,
    favoriteEmojis: SHARED_FAVORITES,
    onAddFavorite: noop,
    onRemoveFavorite: noop,
    layout: 'linear' as const,
    participantProfiles: SHARED_PROFILES,
    memberSettings: SHARED_MEMBER_SETTINGS,
    memberColorDisplay: 'name-only' as const,
    onLinkClick: noop,
    gifsEnabled: true,
    gifAnimateOnHoverOnly: false,
    ...overrides,
  };
}

describe('areChannelMessageBubblePropsEqual', () => {
  it('returns true for identical props', () => {
    const a = makeProps();
    expect(areChannelMessageBubblePropsEqual(a, a)).toBe(true);
  });

  it('returns true for equivalent props (separate wrapper objects, same inner refs)', () => {
    const a = makeProps();
    const b = makeProps();
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(true);
  });

  // --- Top-level scalar props ---

  it('detects isOwn change', () => {
    const a = makeProps({ isOwn: false });
    const b = makeProps({ isOwn: true });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects layout change', () => {
    const a = makeProps({ layout: 'linear' });
    const b = makeProps({ layout: 'bubble' });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects isFlashHighlight change', () => {
    const a = makeProps({ isFlashHighlight: false });
    const b = makeProps({ isFlashHighlight: true });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects isPinned change', () => {
    const a = makeProps({ isPinned: false });
    const b = makeProps({ isPinned: true });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects memberColorDisplay change', () => {
    const a = makeProps({ memberColorDisplay: 'name-only' as const });
    const b = makeProps({ memberColorDisplay: 'name-and-bubble' as const });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects gifsEnabled change', () => {
    const a = makeProps({ gifsEnabled: true });
    const b = makeProps({ gifsEnabled: false });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects verificationRevision change', () => {
    const a = makeProps({ verificationRevision: 0 });
    const b = makeProps({ verificationRevision: 1 });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  // --- Message field changes ---

  it('detects message.id change', () => {
    const a = makeProps({ message: makeMessage({ id: 'msg-1' }) });
    const b = makeProps({ message: makeMessage({ id: 'msg-2' }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.body change', () => {
    const a = makeProps({ message: makeMessage({ body: 'hello' }) });
    const b = makeProps({ message: makeMessage({ body: 'world' }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.deleted change', () => {
    const a = makeProps({ message: makeMessage({ deleted: false }) });
    const b = makeProps({ message: makeMessage({ deleted: true }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.revisionCount change', () => {
    const a = makeProps({ message: makeMessage({ revisionCount: 0 }) });
    const b = makeProps({ message: makeMessage({ revisionCount: 1 }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.expiresAt change', () => {
    const a = makeProps({ message: makeMessage({ expiresAt: undefined }) });
    const b = makeProps({ message: makeMessage({ expiresAt: '2025-01-01T00:00:00Z' }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.decryptionError change', () => {
    const a = makeProps({ message: makeMessage({ decryptionError: undefined }) });
    const b = makeProps({ message: makeMessage({ decryptionError: 'key missing' }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.forwardSecrecy change', () => {
    const a = makeProps({ message: makeMessage({ forwardSecrecy: true }) });
    const b = makeProps({ message: makeMessage({ forwardSecrecy: false }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects message.signatureVerified change', () => {
    const a = makeProps({ message: makeMessage({ signatureVerified: true }) });
    const b = makeProps({ message: makeMessage({ signatureVerified: false }) });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  // --- Profile changes ---

  it('detects senderProfile.id change', () => {
    const a = makeProps({ senderProfile: { id: 'p1', displayName: 'A' } as never });
    const b = makeProps({ senderProfile: { id: 'p2', displayName: 'A' } as never });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects senderProfile.avatarUrl change', () => {
    const a = makeProps({ senderProfile: { id: 'p1', displayName: 'A', avatarUrl: 'u1' } as never });
    const b = makeProps({ senderProfile: { id: 'p1', displayName: 'A', avatarUrl: 'u2' } as never });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects senderProfile.displayName change', () => {
    const a = makeProps({ senderProfile: { id: 'p1', displayName: 'Alice' } as never });
    const b = makeProps({ senderProfile: { id: 'p1', displayName: 'Bob' } as never });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  // --- Reaction changes ---

  it('detects reaction count change', () => {
    const a = makeProps({
      groupedReactions: [{ emoji: '👍', count: 1, isOwn: false, identityIds: [] }] as never[],
    });
    const b = makeProps({
      groupedReactions: [{ emoji: '👍', count: 2, isOwn: false, identityIds: [] }] as never[],
    });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects reaction added', () => {
    const a = makeProps({ groupedReactions: [] });
    const b = makeProps({
      groupedReactions: [{ emoji: '👍', count: 1, isOwn: false, identityIds: [] }] as never[],
    });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects reaction isOwn flip', () => {
    const a = makeProps({
      groupedReactions: [{ emoji: '👍', count: 1, isOwn: false, identityIds: [] }] as never[],
    });
    const b = makeProps({
      groupedReactions: [{ emoji: '👍', count: 1, isOwn: true, identityIds: [] }] as never[],
    });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  // --- Favorite emoji changes ---

  it('detects favoriteEmojis length change', () => {
    const a = makeProps({ favoriteEmojis: ['👍'] });
    const b = makeProps({ favoriteEmojis: ['👍', '❤️'] });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects favoriteEmojis content change', () => {
    const a = makeProps({ favoriteEmojis: ['👍', '❤️'] });
    const b = makeProps({ favoriteEmojis: ['👍', '🎉'] });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  // --- Reply quote changes ---

  it('detects replyQuote added', () => {
    const a = makeProps({ replyQuote: null });
    const b = makeProps({ replyQuote: { text: 'hi', onQuoteClick: noop } });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects replyQuote text change', () => {
    const a = makeProps({ replyQuote: { text: 'hi', onQuoteClick: noop } });
    const b = makeProps({ replyQuote: { text: 'bye', onQuoteClick: noop } });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('detects replyQuote author change', () => {
    const a = makeProps({ replyQuote: { text: 'hi', onQuoteClick: noop, quotedAuthor: { displayName: 'A' } } });
    const b = makeProps({ replyQuote: { text: 'hi', onQuoteClick: noop, quotedAuthor: { displayName: 'B' } } });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('returns true when replyQuote content is identical', () => {
    const q = { text: 'hi', onQuoteClick: noop, quotedAuthor: { displayName: 'A', avatarUrl: 'u1' } };
    const a = makeProps({ replyQuote: { ...q } });
    const b = makeProps({ replyQuote: { ...q } });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(true);
  });

  // --- fsInfo deep comparison ---

  it('returns true when fsInfo is same reference', () => {
    const fs = { rotationLabel: '1h', readableWindow: '1 hour', tooltip: 'tip' };
    const a = makeProps({ fsInfo: fs });
    const b = makeProps({ fsInfo: fs });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(true);
  });

  it('returns true when fsInfo has equal fields but different references', () => {
    const a = makeProps({ fsInfo: { rotationLabel: '1h', readableWindow: '1 hour', tooltip: 'tip' } });
    const b = makeProps({ fsInfo: { rotationLabel: '1h', readableWindow: '1 hour', tooltip: 'tip' } });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(true);
  });

  it('detects fsInfo readableWindow change', () => {
    const a = makeProps({ fsInfo: { rotationLabel: '1h', readableWindow: '1 hour', tooltip: 'tip' } });
    const b = makeProps({ fsInfo: { rotationLabel: '1h', readableWindow: '2 hours', tooltip: 'tip' } });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  // --- onStartEdit identity ---

  it('detects onStartEdit function change', () => {
    const a = makeProps({ onStartEdit: () => {} });
    const b = makeProps({ onStartEdit: () => {} });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(false);
  });

  it('returns true when onStartEdit is same reference', () => {
    const fn = () => {};
    const a = makeProps({ onStartEdit: fn });
    const b = makeProps({ onStartEdit: fn });
    expect(areChannelMessageBubblePropsEqual(a, b)).toBe(true);
  });
});
