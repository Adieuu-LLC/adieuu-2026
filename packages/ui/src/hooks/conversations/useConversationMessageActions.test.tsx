import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';
import '../../test/react-i18next-mock';

const toast = { success: mock(() => {}), error: mock(() => {}) };
mock.module('../../components/Toast', () => ({ useToast: () => toast }));

mock.module('../../services/messagePayload', () => ({
  parsePayload: (raw: string) => JSON.parse(raw),
}));

const { useConversationMessageActions } = await import('./useConversationMessageActions');

function makeParams(overrides?: Partial<Parameters<typeof useConversationMessageActions>[0]>) {
  return {
    conversationId: 'c1',
    deleteMessage: mock(() => {}),
    pinMessage: mock(async () => true),
    unpinMessage: mock(async () => true),
    ...overrides,
  };
}

describe('useConversationMessageActions', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
  });

  test('handleStartEdit clears reply and sets editing target', async () => {
    const { result } = await renderHook(() => useConversationMessageActions(makeParams()));
    const reply = { id: 'r1' } as never;
    const editTarget = { id: 'm1' } as never;

    await act(async () => {
      result.current.setReplyingTo(reply);
    });
    expect(result.current.replyingTo).toBe(reply);

    await act(async () => {
      result.current.handleStartEdit(editTarget);
    });
    expect(result.current.replyingTo).toBe(null);
    expect(result.current.editingMessage).toBe(editTarget);
  });

  test('delete forwards to deleteMessage with the conversation id', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useConversationMessageActions(params));
    await act(async () => {
      result.current.handleDeleteMessage('m1', true);
    });
    expect(params.deleteMessage).toHaveBeenCalledWith('c1', 'm1', true);
  });

  test('pin failure surfaces an error toast', async () => {
    const params = makeParams({ pinMessage: mock(async () => false) });
    const { result } = await renderHook(() => useConversationMessageActions(params));
    await act(async () => {
      await result.current.handlePinMessage('m1');
    });
    expect(toast.error).toHaveBeenCalled();
  });

  test('report handler sets the target and opens the modal', async () => {
    const { result } = await renderHook(() => useConversationMessageActions(makeParams()));
    await act(async () => {
      result.current.handleReportMessage('m9');
    });
    expect(result.current.reportTargetMessageId).toBe('m9');
    expect(result.current.reportModalOpen).toBe(true);
  });

  test('editing content is derived from the message payload', async () => {
    const editing = {
      id: 'm1',
      clientMessageId: 'cid',
      decryptedContent: JSON.stringify({ text: 'hello', attachments: [{ id: 'a' }], gifAttachments: [] }),
    } as never;
    const { result } = await renderHook(() => useConversationMessageActions(makeParams()));
    await act(async () => {
      result.current.setEditingMessage(editing);
    });
    expect(result.current.editingInitialPlaintext).toBe('hello');
    expect(result.current.editingInitialAttachments).toEqual({ media: [{ id: 'a' }], gifs: [] });
  });

  test('editingInitialAttachments is undefined when there are none', async () => {
    const editing = {
      id: 'm2',
      decryptedContent: JSON.stringify({ text: 'x', attachments: [], gifAttachments: [] }),
    } as never;
    const { result } = await renderHook(() => useConversationMessageActions(makeParams()));
    await act(async () => {
      result.current.setEditingMessage(editing);
    });
    expect(result.current.editingInitialAttachments).toBeUndefined();
  });
});
