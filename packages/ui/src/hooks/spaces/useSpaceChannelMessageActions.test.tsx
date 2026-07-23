import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';

mock.module('../../services/messagePayload', () => ({
  parsePayload: (raw: string) => {
    try { return JSON.parse(raw); } catch { return { text: raw, attachments: [], gifAttachments: [], mentions: [], pageTags: [], customEmojis: {} }; }
  },
}));

mock.module('../../pages/spaces/spaceChannelCipher', () => ({
  looksLikeCipherPayload: (content: string) => {
    try {
      const parsed = JSON.parse(content);
      return !!(parsed && parsed.ciphertext && parsed.nonce && parsed.cipherId);
    } catch {
      return false;
    }
  },
  decryptEditHistoryEntry: (entry: { content?: string; ciphertext?: string }) => ({
    plaintext: `decrypted:${entry.ciphertext ?? entry.content ?? ''}`,
  }),
}));

const { useSpaceChannelMessageActions } = await import('./useSpaceChannelMessageActions');

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    spaces: {
      deleteMessage: mock(async () => ({ success: true })),
      modDeleteMessage: mock(async () => ({ success: true })),
      getMessage: mock(async () => ({
        success: true,
        data: { revisionHistory: [{ content: 'old text', replacedAt: '2024-01-01' }] },
      })),
      ...overrides,
    },
  };
}

const t = ((key: string, fallback?: string) => fallback ?? key) as never;

function makeParams(overrides?: Partial<Parameters<typeof useSpaceChannelMessageActions>[0]>) {
  return {
    spaceId: 'sp-1',
    channelId: 'ch-1',
    isEncrypted: false,
    spaceCipher: null,
    participantProfiles: {} as Record<string, import('@adieuu/shared').PublicIdentity>,
    api: makeApi(),
    t,
    ...overrides,
  };
}

function makeMsg(overrides: Record<string, unknown> = {}) {
  return {
    id: 'm1',
    channelId: 'ch-1',
    fromIdentityId: 'user-1',
    createdAt: '2024-01-01T00:00:00Z',
    body: 'hello world',
    attachments: [],
    gifAttachments: [],
    mentions: [],
    pageTags: [],
    customEmojis: {},
    deleted: false,
    revisionCount: 0,
    ...overrides,
  } as never;
}

describe('useSpaceChannelMessageActions', () => {
  test('handleStartEdit clears reply and sets editing target', async () => {
    const { result } = await renderHook(() => useSpaceChannelMessageActions(makeParams()));

    await act(async () => {
      result.current.handleReply(makeMsg());
    });
    expect(result.current.replyContext).not.toBeNull();

    await act(async () => {
      result.current.handleStartEdit(makeMsg({ id: 'm2' }));
    });
    expect(result.current.replyContext).toBeNull();
    expect(result.current.editingMessage!.id).toBe('m2');
  });

  test('handleStartEdit is a no-op at max edits', async () => {
    const { result } = await renderHook(() => useSpaceChannelMessageActions(makeParams()));

    await act(async () => {
      result.current.handleStartEdit(makeMsg({ revisionCount: 3 }));
    });
    expect(result.current.editingMessage).toBeNull();
  });

  test('handleDeleteMessage calls api.spaces.deleteMessage for self-delete', async () => {
    const api = makeApi();
    const { result } = await renderHook(() => useSpaceChannelMessageActions(makeParams({ api })));

    await act(async () => {
      result.current.handleDeleteMessage('m1', false);
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(api.spaces.deleteMessage).toHaveBeenCalledWith('sp-1', 'ch-1', 'm1');
  });

  test('handleDeleteMessage calls modDeleteMessage for forEveryone', async () => {
    const api = makeApi();
    const { result } = await renderHook(() => useSpaceChannelMessageActions(makeParams({ api })));

    await act(async () => {
      result.current.handleDeleteMessage('m1', true);
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(api.spaces.modDeleteMessage).toHaveBeenCalledWith('sp-1', 'ch-1', 'm1');
  });

  test('loadEditHistory returns decrypted entries', async () => {
    const api = makeApi();
    const { result } = await renderHook(() =>
      useSpaceChannelMessageActions(makeParams({ api, isEncrypted: true, spaceCipher: {} as never })),
    );

    let history: unknown;
    await act(async () => {
      history = await result.current.loadEditHistory('m1');
    });
    expect(history).toEqual([{ replacedAt: '2024-01-01', plaintext: 'decrypted:old text' }]);
  });

  test('loadEditHistory returns decryptionError when encrypted and cipher unavailable', async () => {
    const api = makeApi({
      getMessage: mock(async () => ({
        success: true,
        data: {
          revisionHistory: [
            { ciphertext: 'ct', nonce: 'n', cipherId: 'cid', replacedAt: '2024-01-01' },
          ],
        },
      })),
    });
    const { result } = await renderHook(() =>
      useSpaceChannelMessageActions(makeParams({ api, isEncrypted: true, spaceCipher: null })),
    );

    let history: unknown;
    await act(async () => {
      history = await result.current.loadEditHistory('m1');
    });
    expect(history).toEqual([{ replacedAt: '2024-01-01', decryptionError: 'Unable to decrypt' }]);
  });

  test('handleDeleteMessage surfaces response-level failures via showError', async () => {
    const showError = mock(() => {});
    const api = makeApi({
      deleteMessage: mock(async () => ({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Nope' },
      })),
    });
    const { result } = await renderHook(() =>
      useSpaceChannelMessageActions(makeParams({ api, showError })),
    );

    await act(async () => {
      result.current.handleDeleteMessage('m1', false);
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(showError).toHaveBeenCalledWith('Nope');
  });

  test('clears reply and editing when channelId changes', async () => {
    const { result, rerender } = await renderHook(
      (props: { channelId: string }) =>
        useSpaceChannelMessageActions(makeParams({ channelId: props.channelId })),
      { initialProps: { channelId: 'ch-1' } },
    );

    await act(async () => {
      result.current.handleStartEdit(makeMsg({ id: 'm2' }));
    });
    await act(async () => {
      result.current.handleReply(makeMsg());
    });
    expect(result.current.editingMessage).not.toBeNull();
    expect(result.current.replyContext).not.toBeNull();

    await act(async () => {
      rerender({ channelId: 'ch-2' });
    });
    expect(result.current.replyContext).toBeNull();
    expect(result.current.editingMessage).toBeNull();
  });

  test('editingInitialPlaintext derives from body', async () => {
    const { result } = await renderHook(() => useSpaceChannelMessageActions(makeParams()));

    await act(async () => {
      result.current.handleStartEdit(makeMsg({ body: 'edit me' }));
    });
    expect(result.current.editingInitialPlaintext).toBe('edit me');
  });
});
