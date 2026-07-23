import { describe, expect, mock, test, beforeEach } from 'bun:test';
import type { MutableRefObject } from 'react';
import type { TFunction } from 'i18next';
import { renderHook, act } from '../../test/renderHook';

beforeEach(() => {
  (globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame =
    (cb) => setTimeout(() => cb(0), 0) as unknown as number;
});

const copyPlainTextToClipboard = mock(async () => true);
const readPlainTextFromClipboard = mock(async () => 'from-clipboard');
mock.module('../../utils/contextMenuClipboard', () => ({
  copyPlainTextToClipboard,
  readPlainTextFromClipboard,
}));

const shouldInterceptPasteForMediaInspection = mock(() => false);
const readClipboardMediaFilesViaApi = mock(async () => ({ files: [], oversized: false }));
mock.module('./conversationMediaFromClipboard', () => ({
  gatherConversationMediaFromDataTransfer: mock(async () => ({ files: [], oversized: false })),
  readClipboardMediaFilesViaApi,
  shouldInterceptPasteForMediaInspection,
  clipboardPasteSuggestsNonPlainMedia: mock(() => false),
  gatherConversationMediaFromFileList: mock(async () => ({ files: [], oversized: false })),
}));

const { useComposerPasteAndClipboard } = await import('./useComposerPasteAndClipboard');

const t = ((key: string, def?: string | Record<string, unknown>) =>
  typeof def === 'string' ? def : key) as unknown as TFunction;

function makeInputRef(text: string) {
  return {
    current: {
      selectionStart: 1,
      selectionEnd: 1,
      focus: mock(() => {}),
      setSelectionRange: mock(() => {}),
      value: text,
    },
  } as unknown as Parameters<typeof useComposerPasteAndClipboard>[0]['inputRef'];
}

function makeParams(overrides: Partial<Parameters<typeof useComposerPasteAndClipboard>[0]> = {}) {
  const messageTextRef: MutableRefObject<string> = { current: 'ab' };
  return {
    disabled: false,
    inputRef: makeInputRef('ab'),
    messageText: 'ab',
    messageTextRef,
    setMessageText: mock(() => {}),
    handleUpdateMentionOffsets: mock(() => {}),
    handleShortcodeDetect: mock(() => {}),
    handleMentionDetect: mock(() => {}),
    handlePageTagDetect: mock(() => {}),
    showComposerToast: mock(() => {}),
    warnAttachmentTooLarge: mock(() => {}),
    commitMediaFilesToAttachments: mock(() => {}),
    conversationMediaGatherOpts: { maxBytes: 1024 },
    t,
    toastWarning: mock(() => {}),
    toastError: mock(() => {}),
    ...overrides,
  };
}

describe('useComposerPasteAndClipboard', () => {
  test('handleCopy shows the copied mini-toast', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));
    await act(async () => {
      result.current.handleCopy();
    });
    expect(params.showComposerToast).toHaveBeenCalledWith('Copied');
  });

  test('insertPlainTextAtCaret splices text at the caret and re-runs detection', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));

    await act(async () => {
      result.current.insertPlainTextAtCaret('X');
    });

    expect(params.setMessageText).toHaveBeenCalledWith('aXb', 2);
    expect(params.handleShortcodeDetect).toHaveBeenCalledWith('aXb', 2);
    expect(params.handleMentionDetect).toHaveBeenCalledWith('aXb', 2);
    expect(params.handlePageTagDetect).toHaveBeenCalledWith('aXb', 2);
  });

  test('insertPlainTextAtCaret is a no-op when disabled', async () => {
    const params = makeParams({ disabled: true });
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));
    await act(async () => {
      result.current.insertPlainTextAtCaret('X');
    });
    expect(params.setMessageText).not.toHaveBeenCalled();
  });

  test('context menu copy copies the current selection', async () => {
    copyPlainTextToClipboard.mockClear();
    const params = makeParams();
    params.inputRef.current!.selectionStart = 0;
    params.inputRef.current!.selectionEnd = 2;
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));

    await act(async () => {
      await result.current.handleComposerContextMenu({ value: 'copy' });
    });

    expect(copyPlainTextToClipboard).toHaveBeenCalledWith('ab');
    expect(params.showComposerToast).toHaveBeenCalledWith('Copied');
  });

  test('context menu copy-all copies the whole message', async () => {
    copyPlainTextToClipboard.mockClear();
    const params = makeParams({ messageText: 'the whole thing' });
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));

    await act(async () => {
      await result.current.handleComposerContextMenu({ value: 'copy-all' });
    });

    expect(copyPlainTextToClipboard).toHaveBeenCalledWith('the whole thing');
  });

  test('context menu paste inserts plain text from the clipboard', async () => {
    readPlainTextFromClipboard.mockImplementationOnce(async () => 'pasted!');
    const params = makeParams();
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));

    await act(async () => {
      await result.current.handleComposerContextMenu({ value: 'paste' });
    });

    expect(params.setMessageText).toHaveBeenCalledWith('apasted!b', 8);
    expect(params.showComposerToast).toHaveBeenCalledWith('Pasted');
  });

  test('plain-text paste event shows the pasted toast', async () => {
    shouldInterceptPasteForMediaInspection.mockImplementationOnce(() => false);
    const params = makeParams();
    const { result } = await renderHook(() => useComposerPasteAndClipboard(params));

    const evt = {
      clipboardData: {
        items: [{ type: 'text/plain' }],
        getData: () => 'text',
      },
      preventDefault: mock(() => {}),
    } as unknown as React.ClipboardEvent;

    await act(async () => {
      result.current.handlePaste(evt);
    });

    expect(params.showComposerToast).toHaveBeenCalledWith('Pasted');
  });
});
