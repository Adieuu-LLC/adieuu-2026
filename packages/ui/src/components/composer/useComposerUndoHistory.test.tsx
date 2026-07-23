import { describe, expect, mock, test, beforeEach } from 'bun:test';
import { renderHook, act } from '../../test/renderHook';
import { useComposerUndoHistory } from './useComposerUndoHistory';

beforeEach(() => {
  (globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame =
    (cb) => setTimeout(() => cb(0), 0) as unknown as number;
  (globalThis as unknown as { cancelAnimationFrame: (id: number) => void }).cancelAnimationFrame = (id) =>
    clearTimeout(id);
});

function makeInputRef() {
  return { current: { setSelectionRange: mock(() => {}) } } as unknown as Parameters<
    typeof useComposerUndoHistory
  >[0]['inputRef'];
}

function keyEvent(key: string, opts: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  return {
    key,
    ctrlKey: opts.ctrlKey ?? false,
    metaKey: false,
    shiftKey: opts.shiftKey ?? false,
    preventDefault: mock(() => {}),
  } as unknown as React.KeyboardEvent;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useComposerUndoHistory', () => {
  test('setMessageText updates text state and the ref', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));

    await act(async () => {
      result.current.setMessageText('abc', 3);
    });

    expect(result.current.messageText).toBe('abc');
    expect(result.current.messageTextRef.current).toBe('abc');
  });

  test('debounced snapshot pushes onto the undo stack after 300ms', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));

    await act(async () => {
      result.current.setMessageText('hello', 5);
    });
    expect(result.current.undoStackRef.current).toHaveLength(1);

    await act(async () => {
      await sleep(350);
    });
    expect(result.current.undoStackRef.current.at(-1)).toEqual({ text: 'hello', cursor: 5 });
  });

  test('ctrl+z restores the previous snapshot and populates redo', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));

    await act(async () => {
      result.current.undoStackRef.current = [
        { text: '', cursor: 0 },
        { text: 'abc', cursor: 3 },
      ];
      result.current.setMessageText('abc', 3);
    });

    let handled = false;
    await act(async () => {
      handled = result.current.handleUndoRedoKeyDown(keyEvent('z', { ctrlKey: true }));
    });

    expect(handled).toBe(true);
    expect(result.current.messageText).toBe('');
    expect(result.current.redoStackRef.current).toEqual([{ text: 'abc', cursor: 3 }]);
  });

  test('ctrl+y re-applies a redo snapshot', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));

    await act(async () => {
      result.current.undoStackRef.current = [{ text: '', cursor: 0 }];
      result.current.redoStackRef.current = [{ text: 'abc', cursor: 3 }];
    });

    await act(async () => {
      result.current.handleUndoRedoKeyDown(keyEvent('y', { ctrlKey: true }));
    });

    expect(result.current.messageText).toBe('abc');
    expect(result.current.redoStackRef.current).toHaveLength(0);
  });

  test('ctrl+z is a no-op (still handled) when only the pristine entry remains', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));

    let handled = false;
    const evt = keyEvent('z', { ctrlKey: true });
    await act(async () => {
      handled = result.current.handleUndoRedoKeyDown(evt);
    });

    expect(handled).toBe(true);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(result.current.messageText).toBe('');
  });

  test('resetHistory returns stacks to the pristine state', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));

    await act(async () => {
      result.current.undoStackRef.current = [{ text: '', cursor: 0 }, { text: 'x', cursor: 1 }];
      result.current.redoStackRef.current = [{ text: 'y', cursor: 1 }];
      result.current.resetHistory();
    });

    expect(result.current.undoStackRef.current).toEqual([{ text: '', cursor: 0 }]);
    expect(result.current.redoStackRef.current).toEqual([]);
  });

  test('non-modifier keys are not handled', async () => {
    const { result } = await renderHook(() => useComposerUndoHistory({ inputRef: makeInputRef() }));
    let handled = true;
    await act(async () => {
      handled = result.current.handleUndoRedoKeyDown(keyEvent('a'));
    });
    expect(handled).toBe(false);
  });
});
