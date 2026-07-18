import { describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderElement } from '../../test/renderHook';
import type { DecryptedConversation } from '../../hooks/conversations/types';

mock.module('./ConversationToolbar', () => ({
  ConversationToolbar: (props: {
    callSlot?: unknown;
    showCallInMenu?: boolean;
    isSearchActive?: boolean;
    hasDeviceSignatures?: boolean;
  }) =>
    createElement('div', {
      'data-testid': 'toolbar',
      'data-call-slot': props.callSlot ? 'yes' : 'no',
      'data-show-call-menu': String(props.showCallInMenu),
      'data-search-active': String(props.isSearchActive),
      'data-has-device-sigs': String(props.hasDeviceSignatures),
    }),
}));

const { ConversationHeader } = await import('./ConversationHeader');

const t = ((key: string, fallback?: string) => fallback ?? key) as never;
const conversation = {
  id: 'c1',
  type: 'group',
  participants: ['me', 'other'],
  admins: ['me'],
  unreadCount: 0,
  hasUnread: false,
} as DecryptedConversation;

function baseProps(overrides?: Record<string, unknown>) {
  return {
    conversation,
    identity: { id: 'me' } as never,
    t,
    displayName: 'Group',
    avatarMembers: [],
    subtitle: null,
    isDmBlocked: false,
    blockedByOther: false,
    audioAllowed: true,
    isInCallElsewhere: false,
    isInCallHere: false,
    onStartCall: () => {},
    canManagePins: false,
    participantProfiles: {},
    memberSettings: {},
    messagesById: new Map(),
    memberColorDisplay: 'off' as never,
    loadPinnedMessagesPage: async () => null,
    scrollToMessageId: () => {},
    onUnpin: async () => {},
    ensureReplyParentHydration: async () => {},
    prefs: { convGifHidden: false, gifsGloballyDisabled: false, effectiveGifAnimateOnHover: false } as never,
    mediaOutboxOpen: false,
    setMediaOutboxOpen: () => {},
    hasMediaOutboxJobs: false,
    onOpenMemberSecurity: () => {},
    messageSearchSessionActive: false,
    onToggleMessageSearch: () => {},
    activePane: null,
    setActivePane: () => {},
    canDeleteConversation: false,
    onDeleteGroup: () => {},
    onLeave: () => {},
    ...overrides,
  };
}

describe('ConversationHeader', () => {
  test('exposes the call slot when calls are allowed', async () => {
    const { container } = await renderElement(createElement(ConversationHeader, baseProps()));
    const toolbar = container.querySelector('[data-testid="toolbar"]');
    expect(toolbar?.getAttribute('data-call-slot')).toBe('yes');
    expect(toolbar?.getAttribute('data-show-call-menu')).toBe('true');
  });

  test('hides the call slot for a blocked DM', async () => {
    const { container } = await renderElement(
      createElement(ConversationHeader, baseProps({ isDmBlocked: true })),
    );
    const toolbar = container.querySelector('[data-testid="toolbar"]');
    expect(toolbar?.getAttribute('data-call-slot')).toBe('no');
    expect(toolbar?.getAttribute('data-show-call-menu')).toBe('false');
  });

  test('hides the call slot when audio calls are disabled', async () => {
    const { container } = await renderElement(
      createElement(ConversationHeader, baseProps({ audioAllowed: false })),
    );
    expect(container.querySelector('[data-testid="toolbar"]')?.getAttribute('data-call-slot')).toBe('no');
  });

  test('reflects search-active and device-signature availability', async () => {
    const { container } = await renderElement(
      createElement(ConversationHeader, baseProps({ messageSearchSessionActive: true })),
    );
    const toolbar = container.querySelector('[data-testid="toolbar"]');
    expect(toolbar?.getAttribute('data-search-active')).toBe('true');
    expect(toolbar?.getAttribute('data-has-device-sigs')).toBe('true');
  });

  test('marks device signatures unavailable without an identity', async () => {
    const { container } = await renderElement(
      createElement(ConversationHeader, baseProps({ identity: null })),
    );
    expect(container.querySelector('[data-testid="toolbar"]')?.getAttribute('data-has-device-sigs')).toBe('false');
  });
});
