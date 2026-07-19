import { describe, expect, mock, test, beforeEach } from 'bun:test';
import type { TFunction } from 'i18next';
import { renderHook, act } from '../../test/renderHook';

const gatherMock = mock(async (files: FileList | File[]) => ({
  files: Array.from(files as File[]),
  oversized: false,
}));

mock.module('./conversationMediaFromClipboard', () => ({
  gatherConversationMediaFromFileList: gatherMock,
  gatherConversationMediaFromDataTransfer: mock(async () => ({ files: [], oversized: false })),
  readClipboardMediaFilesViaApi: mock(async () => ({ files: [], oversized: false })),
  shouldInterceptPasteForMediaInspection: mock(() => false),
  clipboardPasteSuggestsNonPlainMedia: mock(() => false),
}));

const { useComposerAttachments } = await import('./useComposerAttachments');

const t = ((key: string, def?: string | Record<string, unknown>) =>
  typeof def === 'string' ? def : key) as unknown as TFunction;

function makeParams(overrides: Partial<Parameters<typeof useComposerAttachments>[0]> = {}) {
  return {
    t,
    toastWarning: mock(() => {}),
    conversationMediaMaxBytes: 10 * 1024 * 1024,
    conversationMediaGatherOpts: { maxBytes: 10 * 1024 * 1024 },
    fileInputRef: { current: { value: 'prev' } } as unknown as Parameters<
      typeof useComposerAttachments
    >[0]['fileInputRef'],
    disabled: false,
    sending: false,
    ...overrides,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  gatherMock.mockClear();
  let counter = 0;
  (globalThis as unknown as { URL: { createObjectURL: () => string; revokeObjectURL: () => void } }).URL = {
    createObjectURL: () => `blob:mock-${counter++}`,
    revokeObjectURL: () => {},
  };
});

describe('useComposerAttachments', () => {
  test('commitMediaFilesToAttachments appends attachments and shows a toast', async () => {
    const { result } = await renderHook(() => useComposerAttachments(makeParams()));

    await act(async () => {
      result.current.commitMediaFilesToAttachments([new File(['x'], 'a.png', { type: 'image/png' })], {
        toastLabel: 'Pasted',
      });
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.composerToast).toBe('Pasted');
  });

  test('caps attachments at MAX_ATTACHMENTS', async () => {
    const { result } = await renderHook(() => useComposerAttachments(makeParams()));
    const files = Array.from({ length: 15 }, (_, i) => new File(['x'], `f${i}.png`, { type: 'image/png' }));

    await act(async () => {
      result.current.commitMediaFilesToAttachments(files);
    });

    expect(result.current.attachments).toHaveLength(10);
  });

  test('removeAttachment drops the entry at the given index', async () => {
    const { result } = await renderHook(() => useComposerAttachments(makeParams()));

    await act(async () => {
      result.current.commitMediaFilesToAttachments([
        new File(['x'], 'a.png', { type: 'image/png' }),
        new File(['y'], 'b.png', { type: 'image/png' }),
      ]);
    });
    await act(async () => {
      result.current.removeAttachment(0);
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(result.current.attachments[0]!.file.name).toBe('b.png');
  });

  test('handleFileSelect resolves media, commits, and clears the input value', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useComposerAttachments(params));

    const file = new File(['x'], 'a.png', { type: 'image/png' });
    await act(async () => {
      result.current.handleFileSelect({
        target: { files: [file] as unknown as FileList },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await tick();
    });

    expect(result.current.attachments).toHaveLength(1);
    expect(params.fileInputRef.current!.value).toBe('');
  });

  test('oversized selection warns the user', async () => {
    gatherMock.mockImplementationOnce(async () => ({ files: [], oversized: true }));
    const params = makeParams();
    const { result } = await renderHook(() => useComposerAttachments(params));

    await act(async () => {
      result.current.handleFileSelect({
        target: { files: [new File(['x'], 'big.png')] as unknown as FileList },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await tick();
    });

    expect(params.toastWarning).toHaveBeenCalledTimes(1);
    expect(result.current.attachments).toHaveLength(0);
  });

  test('addMediaFiles is a no-op while disabled', async () => {
    const params = makeParams({ disabled: true });
    const { result } = await renderHook(() => useComposerAttachments(params));

    await act(async () => {
      result.current.addMediaFiles([new File(['x'], 'a.png', { type: 'image/png' })]);
      await tick();
    });

    expect(result.current.attachments).toHaveLength(0);
    expect(gatherMock).not.toHaveBeenCalled();
  });

  test('allVideosAreMp4 reflects the staged video attachments', async () => {
    const { result } = await renderHook(() => useComposerAttachments(makeParams()));

    await act(async () => {
      result.current.commitMediaFilesToAttachments([new File(['x'], 'clip.mp4', { type: 'video/mp4' })]);
    });
    expect(result.current.allVideosAreMp4).toBe(true);

    await act(async () => {
      result.current.commitMediaFilesToAttachments([new File(['y'], 'clip.webm', { type: 'video/webm' })]);
    });
    expect(result.current.allVideosAreMp4).toBe(false);
  });
});
