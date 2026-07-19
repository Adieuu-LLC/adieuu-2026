import { describe, expect, mock, test, beforeEach, afterEach } from 'bun:test';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import { renderHook, act } from '../../test/renderHook';
import { useComposerSend, type UseComposerSendParams } from './useComposerSend';
import { parsePayload, type GifAttachment } from '../../services/messagePayload';
import { setActiveE2eDeviceId } from '../../services/deviceInfo';
import type { PendingAttachment, TrackedMention, TrackedPageTag } from './composerTypes';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number { return this.map.size; }
  clear(): void { this.map.clear(); }
  getItem(key: string): string | null { return this.map.get(key) ?? null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  key(index: number): string | null { return [...this.map.keys()][index] ?? null; }
}

const t = ((key: string, def?: string | Record<string, unknown>) =>
  typeof def === 'string' ? def : key) as unknown as TFunction;

const sampleGif: GifAttachment = {
  provider: 'klipy',
  type: 'gif',
  url: 'https://static.klipy.com/hd.webp',
  previewUrl: 'https://static.klipy.com/sm.webp',
  tinyUrl: 'https://static.klipy.com/xs.webp',
  blurPreview: '',
  width: 498,
  height: 280,
  searchTerm: 'hello',
  slug: 'hello-662',
};

function makeAttachment(name = 'a.png', type = 'image/png'): PendingAttachment {
  return {
    file: new File(['x'], name, { type }),
    previewUrl: 'blob:preview',
    uploadStatus: 'pending',
    uploadProgress: 0,
  };
}

function makeParams(overrides: Partial<UseComposerSendParams> = {}): UseComposerSendParams {
  const messageTextRef: MutableRefObject<string> = { current: 'hello' };
  const mentionEntriesRef: MutableRefObject<TrackedMention[]> = { current: [] };
  const pageTagEntriesRef: MutableRefObject<TrackedPageTag[]> = { current: [] };
  const inputRef = { current: { focus: mock(() => {}) } } as unknown as UseComposerSendParams['inputRef'];

  return {
    disabled: false,
    channelId: 'chan-1',
    sending: false,
    onSend: mock(async () => 'msg-1'),
    onSendSucceeded: mock(() => {}),
    forwardSecrecy: undefined,
    replyContext: null,
    editContext: null,
    editingInitialAttachments: undefined,
    ttlSeconds: undefined,
    mentionSource: undefined,
    customEmojis: undefined,
    customEmojisDisabled: undefined,
    attachments: [],
    pendingGif: null,
    stripExif: true,
    moderationEnabled: true,
    sendMp4WithoutReencode: false,
    allVideosAreMp4: false,
    enqueueMediaSend: mock(async () => 'job-1'),
    klipyShare: mock(() => {}),
    toastError: mock(() => {}),
    t,
    messageTextRef,
    mentionEntriesRef,
    pageTagEntriesRef,
    inputRef,
    setMessageText: mock(() => {}),
    setPendingGif: mock(() => {}),
    setAttachments: mock(() => {}),
    setSendMp4WithoutReencode: mock(() => {}),
    resetHistory: mock(() => {}),
    ...overrides,
  };
}

async function callSend(params: UseComposerSendParams): Promise<void> {
  const { result } = await renderHook(() => useComposerSend(params));
  await act(async () => {
    await result.current();
  });
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  setActiveE2eDeviceId('e2e-device-uuid');
});

afterEach(() => {
  setActiveE2eDeviceId(null);
});

describe('useComposerSend', () => {
  test('sends plain text, clears state, resets history, focuses input', async () => {
    const params = makeParams();
    await callSend(params);

    expect(params.onSend).toHaveBeenCalledTimes(1);
    const [plaintext, options] = (params.onSend as ReturnType<typeof mock>).mock.calls[0]!;
    expect(parsePayload(plaintext as string).text).toBe('hello');
    expect(options).toEqual({ mentionedIdentityIds: undefined });
    expect(params.setMessageText).toHaveBeenCalledWith('');
    expect(params.setPendingGif).toHaveBeenCalledWith(null);
    expect(params.resetHistory).toHaveBeenCalledTimes(1);
    expect(params.onSendSucceeded).toHaveBeenCalledTimes(1);
    expect(params.inputRef.current!.focus).toHaveBeenCalled();
  });

  test('no-ops when disabled', async () => {
    const params = makeParams({ disabled: true });
    await callSend(params);
    expect(params.onSend).not.toHaveBeenCalled();
  });

  test('no-ops when there is nothing to send', async () => {
    const params = makeParams({ messageTextRef: { current: '   ' } });
    await callSend(params);
    expect(params.onSend).not.toHaveBeenCalled();
    expect(params.setMessageText).not.toHaveBeenCalled();
  });

  test('no-ops while already sending', async () => {
    const params = makeParams({ sending: true });
    await callSend(params);
    expect(params.onSend).not.toHaveBeenCalled();
  });

  test('includes mentionedIdentityIds and mentions for tracked mentions', async () => {
    const params = makeParams({
      messageTextRef: { current: 'hi @bob' },
      mentionEntriesRef: { current: [{ identityId: 'user-bob', offset: 3, length: 4 }] },
    });
    await callSend(params);

    const [plaintext, options] = (params.onSend as ReturnType<typeof mock>).mock.calls[0]!;
    const parsed = parsePayload(plaintext as string);
    expect(parsed.mentions?.[0]?.id).toBe('user-bob');
    expect((options as { mentionedIdentityIds?: string[] }).mentionedIdentityIds).toEqual(['user-bob']);
  });

  test('gif send shares with Klipy and sends a gif payload', async () => {
    const replyOnCancel = mock(() => {});
    const params = makeParams({
      messageTextRef: { current: '' },
      pendingGif: sampleGif,
      replyContext: { messageId: 'r1', authorName: 'A', snippet: 's', onCancel: replyOnCancel },
    });
    await callSend(params);

    expect(params.klipyShare).toHaveBeenCalledWith({
      slug: 'hello-662',
      type: 'gif',
      searchTerm: 'hello',
    });
    const [plaintext] = (params.onSend as ReturnType<typeof mock>).mock.calls[0]!;
    expect(parsePayload(plaintext as string).gifAttachments?.[0]?.slug).toBe('hello-662');
    expect(replyOnCancel).toHaveBeenCalledTimes(1);
  });

  test('gif send in edit mode does not call Klipy share', async () => {
    const params = makeParams({
      messageTextRef: { current: '' },
      pendingGif: sampleGif,
      editContext: { messageId: 'm1', onCancel: mock(() => {}) },
    });
    await callSend(params);
    expect(params.klipyShare).not.toHaveBeenCalled();
    expect(params.onSend).toHaveBeenCalledTimes(1);
  });

  test('new attachments enqueue a media send instead of onSend', async () => {
    const replyOnCancel = mock(() => {});
    const params = makeParams({
      messageTextRef: { current: 'caption' },
      attachments: [makeAttachment()],
      replyContext: { messageId: 'r1', authorName: 'A', snippet: 's', onCancel: replyOnCancel },
    });
    await callSend(params);

    expect(params.enqueueMediaSend).toHaveBeenCalledTimes(1);
    const input = (params.enqueueMediaSend as ReturnType<typeof mock>).mock.calls[0]![0];
    expect(input.conversationId).toBe('chan-1');
    expect(input.caption).toBe('caption');
    expect(input.files).toHaveLength(1);
    expect(params.onSend).not.toHaveBeenCalled();
    expect(replyOnCancel).toHaveBeenCalledTimes(1);
    expect(params.setAttachments).toHaveBeenCalled();
  });

  test('enqueue failure surfaces a toast and does not clear attachments', async () => {
    const mentions: TrackedMention[] = [{ identityId: 'user-bob', offset: 0, length: 4 }];
    const pageTags: TrackedPageTag[] = [{ pageId: 'home', offset: 5, length: 5 }];
    const params = makeParams({
      messageTextRef: { current: 'caption' },
      mentionEntriesRef: { current: [...mentions] },
      pageTagEntriesRef: { current: [...pageTags] },
      attachments: [makeAttachment()],
      enqueueMediaSend: mock(async () => { throw new Error('boom'); }),
    });
    await callSend(params);

    expect(params.toastError).toHaveBeenCalledTimes(1);
    expect(params.setAttachments).not.toHaveBeenCalled();
    expect(params.setMessageText).toHaveBeenCalledWith('caption');
    expect(params.mentionEntriesRef.current).toEqual(mentions);
    expect(params.pageTagEntriesRef.current).toEqual(pageTags);
  });

  test('edit-mode text send passes only forward-secrecy option', async () => {
    const params = makeParams({
      messageTextRef: { current: 'edited' },
      editContext: { messageId: 'm1', onCancel: mock(() => {}) },
    });
    await callSend(params);

    const [, options] = (params.onSend as ReturnType<typeof mock>).mock.calls[0]!;
    expect(options).toEqual({});
    expect(params.onSendSucceeded).toHaveBeenCalledTimes(1);
  });

  test('does not call onSendSucceeded when onSend resolves null', async () => {
    const params = makeParams({ onSend: mock(async () => null) });
    await callSend(params);
    expect(params.onSendSucceeded).not.toHaveBeenCalled();
  });
});
