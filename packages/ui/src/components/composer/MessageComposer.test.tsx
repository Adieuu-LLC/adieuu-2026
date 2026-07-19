import { describe, expect, test, mock } from 'bun:test';
import { createElement, createRef } from 'react';
import '../../test/react-i18next-mock';
import { act, renderElement } from '../../test/renderHook';
import type { MessageComposerHandle } from './MessageComposer';

mock.module('../Toast', () => ({
  useToast: () => ({ warning: mock(() => {}), error: mock(() => {}), success: mock(() => {}), info: mock(() => {}) }),
}));
mock.module('../../config', () => ({
  useAppConfig: () => ({ apiBaseUrl: 'http://localhost' }),
}));
mock.module('../../hooks/useAuth', () => ({
  useAuth: () => ({ status: 'identity_mode', session: { subscriptions: [], entitlements: [], isLifetime: false } }),
}));
mock.module('../../hooks/useIdentity', () => ({
  useIdentity: () => ({ status: 'unlocked' }),
}));
mock.module('../../services/mediaOutbox', () => ({
  useMediaOutbox: () => ({ enqueueMediaSend: mock(async () => 'job-1') }),
}));
mock.module('../../hooks/useComposerControlsPreference', () => ({
  useComposerControlsPreference: () => [],
  getComposerControlsBySide: () => [],
}));
mock.module('../../utils/videoTranscode', () => ({
  preloadFfmpegCore: () => {},
}));
mock.module('../../icons/Icon', () => ({ Icon: () => null }));
mock.module('./useComposerAutoHeight', () => ({ useComposerAutoHeight: () => false }));
mock.module('./useComposerFieldInsets', () => ({ useComposerFieldInsets: () => ({ left: 0, right: 0 }) }));
mock.module('./ComposerControlRails', () => ({
  ComposerLeftRail: () => createElement('div', { 'data-testid': 'left-rail' }),
  ComposerRightRail: () => createElement('div', { 'data-testid': 'right-rail' }),
}));
mock.module('./ComposerAttachments', () => ({ ComposerAttachments: () => null }));
mock.module('./ComposerBanners', () => ({ ComposerBanners: () => null }));
mock.module('./ComposerAutocomplete', () => ({
  ComposerShortcodeAutocomplete: () => null,
  ComposerMentionAutocomplete: () => null,
  ComposerPageTagAutocomplete: () => null,
}));
mock.module('./ComposerContextMenu', () => ({ ComposerContextMenu: () => null }));

const { MessageComposer } = await import('./MessageComposer');

function getField(container: HTMLElement): HTMLTextAreaElement {
  const field = container.querySelector('textarea.conversation-composer-field');
  if (!field) throw new Error('composer field missing');
  return field as HTMLTextAreaElement;
}

describe('MessageComposer (smoke)', () => {
  test('renders the composer field', async () => {
    const { container } = await renderElement(
      createElement(MessageComposer, { channelId: 'chan-1', sending: false, onSend: async () => 'ok' }),
    );
    const field = getField(container);
    expect(field.getAttribute('placeholder')).toBe('conversations.messagePlaceholder');
    expect(field.disabled).toBe(false);
  });

  test('disables the field when disabled', async () => {
    const { container } = await renderElement(
      createElement(MessageComposer, {
        channelId: 'chan-1',
        sending: false,
        onSend: async () => 'ok',
        disabled: true,
      }),
    );
    const field = getField(container);
    expect(field.disabled).toBe(true);
    expect(field.readOnly).toBe(true);
  });

  test('exposes an imperative addMediaFiles handle that accepts files', async () => {
    const ref = createRef<MessageComposerHandle>();
    await renderElement(
      createElement(MessageComposer, { ref, channelId: 'chan-1', sending: false, onSend: async () => 'ok' }),
    );
    expect(typeof ref.current?.addMediaFiles).toBe('function');

    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], 'a.png', {
      type: 'image/png',
    });
    await act(async () => {
      ref.current?.addMediaFiles([png]);
    });
    expect(ref.current?.addMediaFiles).toBeDefined();
  });

  test('hydrates edit plaintext into the field when editingMessageKey is set', async () => {
    const { container } = await renderElement(
      createElement(MessageComposer, {
        channelId: 'chan-1',
        sending: false,
        onSend: async () => 'ok',
        editContext: { messageId: 'm1', onCancel: () => {} },
        editingMessageKey: 'm1',
        editingInitialPlaintext: 'seeded edit text',
      }),
    );
    const field = getField(container);
    expect(field.value).toBe('seeded edit text');
  });
});
