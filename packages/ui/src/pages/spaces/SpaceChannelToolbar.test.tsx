import { describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import { renderElement } from '../../test/renderHook';

mock.module('../../components/Tooltip', () => ({
  Tooltip: ({ children }: { children: import('react').ReactElement }) => children,
}));

mock.module('../../icons/Icon', () => ({
  Icon: ({ name }: { name: string }) => createElement('span', { 'data-icon': name }),
}));

mock.module('../../components/messaging/ChannelPinsMenu', () => ({
  ChannelPinsMenu: () => createElement('div', { 'data-testid': 'pins-menu' }),
}));

const { SpaceChannelToolbar } = await import('./SpaceChannelToolbar');

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

function baseProps(overrides?: Record<string, unknown>) {
  return {
    channelName: 'general',
    isEncrypted: false,
    memberCount: 42,
    latestPinInfo: null as { preview: string; messageId: string } | null,
    scrollToMessageId: mock(() => {}),
    channelId: 'ch-1',
    pinnedCount: 0,
    pinnedMessageIdsKey: '',
    loadPinnedMessagesPage: mock(async () => null),
    onUnpin: mock(async () => {}),
    canManagePins: true,
    participantProfiles: {},
    memberSettings: {},
    identity: { id: 'me' },
    showMembers: false,
    onToggleMembers: mock(() => {}),
    t,
    ...overrides,
  } as never;
}

describe('SpaceChannelToolbar', () => {
  test('renders channel name', async () => {
    const { container } = await renderElement(createElement(SpaceChannelToolbar, baseProps()));
    expect(container.textContent).toContain('general');
  });

  test('shows encrypted badge when isEncrypted', async () => {
    const { container } = await renderElement(
      createElement(SpaceChannelToolbar, baseProps({ isEncrypted: true })),
    );
    expect(container.querySelector('.spaces-badge--encrypted')).not.toBeNull();
  });

  test('does not show encrypted badge when not encrypted', async () => {
    const { container } = await renderElement(createElement(SpaceChannelToolbar, baseProps()));
    expect(container.querySelector('.spaces-badge--encrypted')).toBeNull();
  });

  test('shows member count when no pin info', async () => {
    const { container } = await renderElement(createElement(SpaceChannelToolbar, baseProps()));
    expect(container.textContent).toContain('42');
    expect(container.textContent).toContain('members');
  });

  test('shows pin preview instead of member count', async () => {
    const { container } = await renderElement(
      createElement(
        SpaceChannelToolbar,
        baseProps({ latestPinInfo: { preview: 'Check this out', messageId: 'p-1' } }),
      ),
    );
    expect(container.textContent).toContain('Check this out');
    expect(container.textContent).not.toContain('42');
  });

  test('members button reflects aria-pressed', async () => {
    const { container } = await renderElement(
      createElement(SpaceChannelToolbar, baseProps({ showMembers: true })),
    );
    const btn = container.querySelector('[aria-pressed="true"]');
    expect(btn).not.toBeNull();
  });
});
