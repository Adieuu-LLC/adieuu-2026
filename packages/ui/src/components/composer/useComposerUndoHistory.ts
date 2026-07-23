import { useCallback, useRef, useState, type MutableRefObject, type RefObject } from 'react';

export interface UseComposerUndoHistoryParams {
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

interface UndoEntry {
  text: string;
  cursor: number;
}

export interface ComposerUndoHistory {
  messageText: string;
  /** Debounced setter that also records history snapshots. */
  setMessageText: (next: string, cursor?: number) => void;
  messageTextRef: MutableRefObject<string>;
  undoStackRef: MutableRefObject<UndoEntry[]>;
  redoStackRef: MutableRefObject<UndoEntry[]>;
  /** Reset stacks to the pristine empty state (used after a successful send). */
  resetHistory: () => void;
  /** Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Y / Shift+Z (redo) handling. Returns true when handled. */
  handleUndoRedoKeyDown: (e: React.KeyboardEvent) => boolean;
}

/**
 * Owns the composer text state plus its debounced undo/redo history stacks.
 * The debounce mirrors the original inline behavior: snapshots are pushed 300ms
 * after the last edit, capped at 200 entries, and any new edit clears the redo stack.
 */
export function useComposerUndoHistory(params: UseComposerUndoHistoryParams): ComposerUndoHistory {
  const { inputRef } = params;

  const [messageText, setMessageTextRaw] = useState('');
  const messageTextRef = useRef(messageText);
  messageTextRef.current = messageText;

  const undoStack = useRef<UndoEntry[]>([{ text: '', cursor: 0 }]);
  const redoStack = useRef<UndoEntry[]>([]);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setMessageText = useCallback((next: string, cursor?: number) => {
    setMessageTextRaw(next);

    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      const top = undoStack.current[undoStack.current.length - 1];
      if (top && top.text === next) return;
      undoStack.current.push({ text: next, cursor: cursor ?? next.length });
      if (undoStack.current.length > 200) undoStack.current.shift();
      redoStack.current = [];
    }, 300);
  }, []);

  const resetHistory = useCallback(() => {
    undoStack.current = [{ text: '', cursor: 0 }];
    redoStack.current = [];
  }, []);

  const handleUndoRedoKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    const isMod = e.ctrlKey || e.metaKey;
    if (isMod && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (undoStack.current.length <= 1) return true;
      const current = undoStack.current.pop()!;
      redoStack.current.push(current);
      const prev = undoStack.current[undoStack.current.length - 1]!;
      setMessageTextRaw(prev.text);
      messageTextRef.current = prev.text;
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(prev.cursor, prev.cursor);
      });
      return true;
    }
    if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || e.key === 'Z')) {
      e.preventDefault();
      if (redoStack.current.length === 0) return true;
      const next = redoStack.current.pop()!;
      undoStack.current.push(next);
      setMessageTextRaw(next.text);
      messageTextRef.current = next.text;
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(next.cursor, next.cursor);
      });
      return true;
    }
    return false;
  }, [inputRef]);

  return {
    messageText,
    setMessageText,
    messageTextRef,
    undoStackRef: undoStack,
    redoStackRef: redoStack,
    resetHistory,
    handleUndoRedoKeyDown,
  };
}
