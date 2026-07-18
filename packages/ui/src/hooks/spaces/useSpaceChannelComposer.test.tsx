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
  encryptContent: (_cipher: unknown, text: string) => ({
    ciphertext: `ct:${text}`,
    nonce: 'n',
    cipherId: 'cid',
  }),
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
    sendMessage: mock(async () => ({ id: 'sent-1' })),
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
    const call = (p.sendMessage as ReturnType<typeof mock>).mock.calls[0]![0] as Record<string, unknown>;
    expect(call.content).toBe('hello');
    expect(call.ciphertext).toBeUndefined();
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
    const call = (p.sendMessage as ReturnType<typeof mock>).mock.calls[0]![0] as Record<string, unknown>;
    expect(call.ciphertext).toBe('ct:secret');
    expect(call.nonce).toBe('n');
    expect(call.cipherId).toBe('cid');
    expect(call.content).toBeUndefined();
  });

  test('onSend in edit mode calls editMessage with cipher fields and clears editing', async () => {
    const setEditingMessage = mock(() => {});
    const editMessage = mock(async () => {});
    const p = makeParams({
      isEncrypted: true,
      spaceCipher: {} as never,
      editingMessage: { id: 'm1' } as never,
      setEditingMessage,
      api: { spaces: { editMessage } },
    });
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('updated text');
    });
    expect(editMessage).toHaveBeenCalledWith('sp-1', 'ch-1', 'm1', {
      ciphertext: 'ct:updated text',
      nonce: 'n',
      cipherId: 'cid',
    });
    expect(setEditingMessage).toHaveBeenCalledWith(null);
  });

  test('onSend in edit mode calls editMessage with plaintext content', async () => {
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
    expect(editMessage).toHaveBeenCalledWith('sp-1', 'ch-1', 'm1', { content: 'updated text' });
    expect(setEditingMessage).toHaveBeenCalledWith(null);
  });

  test('onSend clears replyContext after successful send', async () => {
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
    const call = (p.sendMessage as ReturnType<typeof mock>).mock.calls[0]![0] as Record<string, unknown>;
    expect(call.content).toBe('reply text');
    expect(call.replyToMessageId).toBe('r1');
  });

  test('onSend does not clear replyContext when send returns falsy', async () => {
    const setReplyContext = mock(() => {});
    const p = makeParams({
      replyContext: { messageId: 'r1', authorName: 'A', snippet: 'x', onCancel: () => {} },
      setReplyContext,
      sendMessage: mock(async () => null),
    });
    const { result } = await renderHook(() => useSpaceChannelComposer(p));

    await act(async () => {
      await result.current.onSend('reply text');
    });
    expect(setReplyContext).not.toHaveBeenCalled();
  });
});
