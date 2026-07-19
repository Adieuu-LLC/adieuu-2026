import { describe, expect, mock, test, beforeEach } from 'bun:test';
import type { MutableRefObject } from 'react';
import { renderHook, act } from '../../test/renderHook';

beforeEach(() => {
  (globalThis as unknown as { requestAnimationFrame: (cb: FrameRequestCallback) => number }).requestAnimationFrame =
    (cb) => setTimeout(() => cb(0), 0) as unknown as number;
});
import {
  useComposerAutocomplete,
  acSuggestionKey,
  type UseComposerAutocompleteParams,
} from './useComposerAutocomplete';
import type { MentionSource, PageTagSource } from './composerTypes';

const mentionSource: MentionSource = {
  users: [
    { id: 'user-bob', displayName: 'Bob', username: 'bob' },
    { id: 'user-amy', displayName: 'Amy', username: 'amy' },
  ],
  resolveMentionDisplay: (id) => (id === 'user-bob' ? 'Bob' : 'Amy'),
  isGroup: false,
};

const pageTagSource: PageTagSource = {
  pages: [{ id: 'home', labelDefault: 'Home' }],
  resolvePageDisplay: () => 'Home',
};

function makeInputRef(selectionStart: number) {
  return {
    current: {
      selectionStart,
      focus: mock(() => {}),
      setSelectionRange: mock(() => {}),
    },
  } as unknown as UseComposerAutocompleteParams['inputRef'];
}

function makeParams(overrides: Partial<UseComposerAutocompleteParams> = {}): UseComposerAutocompleteParams {
  const messageTextRef: MutableRefObject<string> = { current: '' };
  return {
    inputRef: makeInputRef(0),
    messageTextRef,
    setMessageText: mock(() => {}),
    mentionSource,
    pageTagSource,
    customEmojis: undefined,
    customEmojisDisabled: undefined,
    mentionInsertRef: undefined,
    ...overrides,
  };
}

function keyEvent(key: string, opts: { shiftKey?: boolean } = {}) {
  return {
    key,
    shiftKey: opts.shiftKey ?? false,
    preventDefault: mock(() => {}),
  } as unknown as React.KeyboardEvent;
}

describe('useComposerAutocomplete', () => {
  test('mention detection produces ranked suggestions', async () => {
    const params = makeParams({ messageTextRef: { current: '@b' } });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handleMentionDetect('@b', 2);
    });

    expect(result.current.mentionSuggestions).toHaveLength(1);
    expect(result.current.mentionSuggestions[0]!.id).toBe('user-bob');
  });

  test('acceptMention splices the mention and tracks its offset', async () => {
    const params = makeParams({ messageTextRef: { current: '@b' }, inputRef: makeInputRef(2) });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handleMentionDetect('@b', 2);
    });
    await act(async () => {
      result.current.acceptMention('user-bob', 'Bob');
    });

    expect(params.setMessageText).toHaveBeenCalledWith('@Bob ', 5);
    expect(result.current.mentionEntriesRef.current).toEqual([
      { identityId: 'user-bob', offset: 0, length: 4 },
    ]);
  });

  test('insertMentionAtCursor inserts at the caret without an active query', async () => {
    const params = makeParams({ messageTextRef: { current: 'hi ' }, inputRef: makeInputRef(3) });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.insertMentionAtCursor('user-amy');
    });

    expect(params.setMessageText).toHaveBeenCalledWith('hi @Amy ', 8);
  });

  test('wires mentionInsertRef to insertMentionAtCursor', async () => {
    const mentionInsertRef: MutableRefObject<((id: string) => void) | null> = { current: null };
    const params = makeParams({ mentionInsertRef, messageTextRef: { current: '' }, inputRef: makeInputRef(0) });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    expect(typeof mentionInsertRef.current).toBe('function');
    expect(mentionInsertRef.current).toBe(result.current.insertMentionAtCursor);
  });

  test('shortcode detection surfaces emoji suggestions and stable keys', async () => {
    const params = makeParams({ messageTextRef: { current: ':smile' } });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handleShortcodeDetect(':smile', 6);
    });

    expect(result.current.acSuggestions.length).toBeGreaterThan(0);
    expect(acSuggestionKey(result.current.acSuggestions[0])).not.toBe('');
  });

  test('page-tag detection produces suggestions', async () => {
    const params = makeParams({ messageTextRef: { current: '#ho' } });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handlePageTagDetect('#ho', 3);
    });

    expect(result.current.pageTagSuggestions).toHaveLength(1);
    expect(result.current.pageTagSuggestions[0]!.id).toBe('home');
  });

  test('acceptPageTag splices the page tag and tracks its offset', async () => {
    const params = makeParams({ messageTextRef: { current: '#ho' }, inputRef: makeInputRef(3) });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handlePageTagDetect('#ho', 3);
    });
    await act(async () => {
      result.current.acceptPageTag('home', 'Home');
    });

    expect(params.setMessageText).toHaveBeenCalledWith('#Home ', 6);
    expect(result.current.pageTagEntriesRef.current).toEqual([{ pageId: 'home', offset: 0, length: 5 }]);
  });

  test('ArrowDown navigates the active mention list and is handled', async () => {
    const params = makeParams({ messageTextRef: { current: '@' } });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handleMentionDetect('@', 1);
    });
    const evt = keyEvent('ArrowDown');
    let handled = false;
    await act(async () => {
      handled = result.current.handleAutocompleteKeyDown(evt);
    });

    expect(handled).toBe(true);
    expect(evt.preventDefault).toHaveBeenCalled();
    expect(result.current.mentionAcSelectedIdx).toBe(1);
  });

  test('Enter accepts the highlighted mention', async () => {
    const params = makeParams({ messageTextRef: { current: '@b' }, inputRef: makeInputRef(2) });
    const { result } = await renderHook(() => useComposerAutocomplete(params));

    await act(async () => {
      result.current.handleMentionDetect('@b', 2);
    });
    await act(async () => {
      result.current.handleAutocompleteKeyDown(keyEvent('Enter'));
    });

    expect(params.setMessageText).toHaveBeenCalledWith('@Bob ', 5);
  });

  test('key handler is a no-op when no autocomplete is active', async () => {
    const params = makeParams();
    const { result } = await renderHook(() => useComposerAutocomplete(params));
    let handled = true;
    await act(async () => {
      handled = result.current.handleAutocompleteKeyDown(keyEvent('ArrowDown'));
    });
    expect(handled).toBe(false);
  });
});
