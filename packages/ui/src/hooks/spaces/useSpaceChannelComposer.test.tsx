import { describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';

mock.module('../../services/messagePayload', () => ({
  parsePayload: (raw: string) => {
    try {
      return JSON.parse(raw);
    } catch {
      return {
        text: raw,
        isStructured: false,
        attachments: [],
        gifAttachments: [],
        mentions: [],
        pageTags: [],
        customEmojis: {},
      };
    }
  },
}));

mock.module('../../pages/spaces/spaceChannelCipher', () => ({
  encryptContent: (_cipher: unknown, text: string) => `encrypted:${text}`,
}));

const { useSpaceChannelComposer } = await import('./useSpaceChannelComposer');

function makeParams(overrides?: Partial<Parameters<typeof useSpaceChannelComposer>[0]>) {
  return {
    spaceId: 'sp-1',
    channelId: 'ch-1',
    isEncrypted: false,
    spaceCipher: null,
    editingMessage: null,
    setEditingMessage: mock(() => {}),
    replyContext: null,
    setReplyContext: mock(() => {}),
    sendMessage: mock(async () => {}),
    api: {
      spaces: {
        editMessage: mock(async () => {}),
      },
    },
    ...overrides,
  };
}

describe('useSpaceChannelComposer', () => {
  test('onSend sends plaintext message', async () => {
    const p = makeParams();
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('hello');
    });
    expect(p.sendMessage).toHaveBeenCalledWith('hello', undefined, undefined, undefined);
  });

  test('onSend skips empty content', async () => {
    const p = makeParams();
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('');
    });
    expect(p.sendMessage).not.toHaveBeenCalled();
  });

  test('onSend encrypts when cipher is present', async () => {
    const p = makeParams({
      isEncrypted: true,
      spaceCipher: {} as never,
    });
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('secret');
    });
    expect(p.sendMessage).toHaveBeenCalledWith('encrypted:secret', undefined, undefined, undefined);
  });

  test('onSend in edit mode calls editMessage and clears editing', async () => {
    const setEditingMessage = mock(() => {});
    const editMessage = mock(async () => {});
    const p = makeParams({
      editingMessage: { id: 'm1' } as never,
      setEditingMessage,
      api: { spaces: { editMessage } },
    });
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('updated text');
    });
    expect(editMessage).toHaveBeenCalledWith('sp-1', 'ch-1', 'm1', 'updated text');
    expect(setEditingMessage).toHaveBeenCalledWith(null);
  });

  test('onSend clears replyContext after sending', async () => {
    const setReplyContext = mock(() => {});
    const p = makeParams({
      replyContext: { messageId: 'r1', authorName: 'A', snippet: 'x', onCancel: () => {} },
      setReplyContext,
    });
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('reply text');
    });
    expect(setReplyContext).toHaveBeenCalledWith(null);
    expect(p.sendMessage).toHaveBeenCalledWith('reply text', 'r1', undefined, undefined);
  });
});
