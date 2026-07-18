import { describe, expect, mock, test } from 'bun:test';
import { createRef } from 'react';
import { renderHook, act } from '../../test/renderHook';
import { useConversationFileDrop } from './useConversationFileDrop';
import type { MessageComposerHandle } from '../../components/composer';

function makeDragEvent(types: string[], files: File[] = []) {
  return {
    preventDefault: mock(() => {}),
    dataTransfer: {
      types,
      files,
      dropEffect: '',
    },
    relatedTarget: null,
    currentTarget: { contains: () => false },
  } as unknown as import('react').DragEvent;
}

describe('useConversationFileDrop', () => {
  test('drag enter with Files activates the overlay', async () => {
    const composerRef = createRef<MessageComposerHandle>();
    const { result } = await renderHook(() =>
      useConversationFileDrop({ conversationId: 'c1', composerInteractionDisabled: false, composerRef }),
    );

    const evt = makeDragEvent(['Files']);
    await act(async () => {
      result.current.handleConversationDragEnter(evt);
    });

    expect(evt.preventDefault).toHaveBeenCalled();
    expect(result.current.conversationDropActive).toBe(true);
  });

  test('drag enter without Files does not activate', async () => {
    const composerRef = createRef<MessageComposerHandle>();
    const { result } = await renderHook(() =>
      useConversationFileDrop({ conversationId: 'c1', composerInteractionDisabled: false, composerRef }),
    );

    await act(async () => {
      result.current.handleConversationDragEnter(makeDragEvent(['text/plain']));
    });

    expect(result.current.conversationDropActive).toBe(false);
  });

  test('drag over sets copy dropEffect only when enabled and Files present', async () => {
    const composerRef = createRef<MessageComposerHandle>();
    const { result } = await renderHook(() =>
      useConversationFileDrop({ conversationId: 'c1', composerInteractionDisabled: false, composerRef }),
    );

    const evt = makeDragEvent(['Files']);
    await act(async () => {
      result.current.handleConversationDragOver(evt);
    });
    expect(evt.dataTransfer.dropEffect).toBe('copy');
  });

  test('drop forwards files to the composer and clears active state', async () => {
    const addMediaFiles = mock(() => {});
    const composerRef = { current: { addMediaFiles } as unknown as MessageComposerHandle };
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const { result } = await renderHook(() =>
      useConversationFileDrop({ conversationId: 'c1', composerInteractionDisabled: false, composerRef }),
    );

    await act(async () => {
      result.current.handleConversationDrop(makeDragEvent(['Files'], [file]));
    });

    expect(addMediaFiles).toHaveBeenCalledTimes(1);
    expect(result.current.conversationDropActive).toBe(false);
  });

  test('all handlers no-op when composer interaction is disabled', async () => {
    const addMediaFiles = mock(() => {});
    const composerRef = { current: { addMediaFiles } as unknown as MessageComposerHandle };
    const { result } = await renderHook(() =>
      useConversationFileDrop({ conversationId: 'c1', composerInteractionDisabled: true, composerRef }),
    );

    const enter = makeDragEvent(['Files']);
    await act(async () => {
      result.current.handleConversationDragEnter(enter);
      result.current.handleConversationDrop(makeDragEvent(['Files'], [new File(['x'], 'a.png')]));
    });

    expect(enter.preventDefault).not.toHaveBeenCalled();
    expect(result.current.conversationDropActive).toBe(false);
    expect(addMediaFiles).not.toHaveBeenCalled();
  });

  test('resets active state when the conversation changes', async () => {
    const composerRef = createRef<MessageComposerHandle>();
    const { result, rerender } = await renderHook(
      (props: { conversationId: string }) =>
        useConversationFileDrop({
          conversationId: props.conversationId,
          composerInteractionDisabled: false,
          composerRef,
        }),
      { initialProps: { conversationId: 'c1' } },
    );

    await act(async () => {
      result.current.handleConversationDragEnter(makeDragEvent(['Files']));
    });
    expect(result.current.conversationDropActive).toBe(true);

    await rerender({ conversationId: 'c2' });
    expect(result.current.conversationDropActive).toBe(false);
  });
});
