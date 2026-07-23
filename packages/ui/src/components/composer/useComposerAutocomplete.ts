import { useCallback, useEffect, useMemo, useRef, useState, startTransition, type MutableRefObject, type RefObject } from 'react';
import { SHORTCODE_ENTRIES } from '../../utils/emojiShortcodes';
import type { PublicCustomEmoji } from '@adieuu/shared';
import type {
  MentionSource,
  PageTagSource,
  TrackedMention,
  TrackedPageTag,
} from './composerTypes';
import { MENTION_EVERYONE_ID, MENTION_HERE_ID } from './composerTypes';
import {
  detectShortcodeQuery,
  detectMentionQuery,
  detectPageTagQuery,
  updateMentionOffsets,
  updatePageTagOffsets,
} from './composerUtils';
import type { MentionSuggestion, PageTagSuggestion } from './ComposerAutocomplete';

type ShortcodeSuggestion = [string, string] | { type: 'custom'; emoji: PublicCustomEmoji };

function sameAcState<T extends { query: string }>(
  prev: T | null,
  next: T | null,
): boolean {
  if (prev === next) return true;
  if (!prev || !next) return false;
  if (prev.query !== next.query) return false;
  for (const key of Object.keys(next) as (keyof T)[]) {
    if (key === 'query') continue;
    if (prev[key] !== next[key]) return false;
  }
  return true;
}

export function acSuggestionKey(s: ShortcodeSuggestion | undefined): string {
  if (!s) return '';
  return Array.isArray(s) ? s[0] : s.emoji.shortcode;
}

export interface UseComposerAutocompleteParams {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  messageTextRef: MutableRefObject<string>;
  setMessageText: (next: string, cursor?: number) => void;
  mentionSource?: MentionSource;
  pageTagSource?: PageTagSource;
  customEmojis?: PublicCustomEmoji[];
  customEmojisDisabled?: boolean;
  mentionInsertRef?: React.MutableRefObject<((identityId: string) => void) | null>;
}

export interface ComposerAutocomplete {
  acSuggestions: ShortcodeSuggestion[];
  acSelectedIdx: number;
  mentionSuggestions: MentionSuggestion[];
  mentionAcSelectedIdx: number;
  pageTagSuggestions: PageTagSuggestion[];
  pageTagAcSelectedIdx: number;
  mentionEntriesRef: MutableRefObject<TrackedMention[]>;
  pageTagEntriesRef: MutableRefObject<TrackedPageTag[]>;
  handleShortcodeDetect: (text: string, cursorPos: number) => void;
  handleMentionDetect: (text: string, cursorPos: number) => void;
  handlePageTagDetect: (text: string, cursorPos: number) => void;
  handleUpdateMentionOffsets: (oldText: string, newText: string, cursorPos: number) => void;
  acceptMention: (identityId: string, displayText: string) => void;
  acceptPageTag: (pageId: string, displayText: string) => void;
  insertMentionAtCursor: (identityId: string) => void;
  handleShortcodeSelect: (code: string, emoji: string) => void;
  /** Autocomplete navigation/accept key handling. Returns true when the event was handled. */
  handleAutocompleteKeyDown: (e: React.KeyboardEvent) => boolean;
}

/**
 * Owns the three autocomplete flavors (shortcode `:`, mention `@`, page-tag `#`):
 * their query state, ranked suggestions, detection, offset tracking, and the
 * keyboard navigation/accept handling. Behavior is preserved exactly from the
 * original inline implementation in MessageComposer.
 */
export function useComposerAutocomplete(params: UseComposerAutocompleteParams): ComposerAutocomplete {
  const {
    inputRef,
    messageTextRef,
    setMessageText,
    mentionSource,
    pageTagSource,
    customEmojis,
    customEmojisDisabled,
    mentionInsertRef,
  } = params;

  // --- shortcode (`:`) autocomplete ---
  const [shortcodeAC, setShortcodeAC] = useState<{ query: string; colonIdx: number } | null>(null);
  const [acSelectedIdx, setAcSelectedIdx] = useState(0);

  const acSuggestions = useMemo(() => {
    if (!shortcodeAC) return [];
    const q = shortcodeAC.query.toLowerCase();
    const prefix: ShortcodeSuggestion[] = [];
    const substring: ShortcodeSuggestion[] = [];
    for (const [code, emoji] of SHORTCODE_ENTRIES) {
      if (code.startsWith(q)) prefix.push([code, emoji]);
      else if (code.includes(q)) substring.push([code, emoji]);
    }
    if (!customEmojisDisabled && customEmojis) {
      for (const ce of customEmojis) {
        const sc = ce.shortcode.toLowerCase();
        if (sc.startsWith(q)) prefix.push({ type: 'custom', emoji: ce });
        else if (sc.includes(q)) substring.push({ type: 'custom', emoji: ce });
      }
    }
    return [...prefix, ...substring].slice(0, 6);
  }, [shortcodeAC, customEmojis, customEmojisDisabled]);

  const shortcodeACRef = useRef(shortcodeAC);
  shortcodeACRef.current = shortcodeAC;
  const acSuggestionsRef = useRef(acSuggestions);
  acSuggestionsRef.current = acSuggestions;
  const acSelectedIdxRef = useRef(acSelectedIdx);
  acSelectedIdxRef.current = acSelectedIdx;

  const handleShortcodeDetect = useCallback((text: string, cursorPos: number) => {
    const result = detectShortcodeQuery(text, cursorPos);
    if (sameAcState(shortcodeACRef.current, result)) return;
    startTransition(() => {
      setShortcodeAC(result);
      if (result) setAcSelectedIdx(0);
    });
  }, []);

  // --- @mention autocomplete ---
  const [mentionAC, setMentionAC] = useState<{ query: string; atIdx: number } | null>(null);
  const [mentionAcSelectedIdx, setMentionAcSelectedIdx] = useState(0);
  const mentionEntriesRef = useRef<TrackedMention[]>([]);

  const mentionACRef = useRef(mentionAC);
  mentionACRef.current = mentionAC;
  const mentionAcSelectedIdxRef = useRef(mentionAcSelectedIdx);
  mentionAcSelectedIdxRef.current = mentionAcSelectedIdx;

  const mentionSuggestions = useMemo((): MentionSuggestion[] => {
    if (!mentionAC || !mentionSource) return [];
    const q = mentionAC.query.toLowerCase();
    const groupMatches: MentionSuggestion[] = [];
    if (mentionSource.isGroup && q.length > 0) {
      for (const opt of [
        { id: MENTION_HERE_ID, displayText: 'here' },
        { id: MENTION_EVERYONE_ID, displayText: 'everyone' },
      ]) {
        if (opt.displayText.startsWith(q)) {
          groupMatches.push({ kind: 'group', id: opt.id, displayText: opt.displayText });
        }
      }
    }
    const prefix: MentionSuggestion[] = [];
    const substring: MentionSuggestion[] = [];
    for (const user of mentionSource.users) {
      const uname = user.username?.toLowerCase() ?? '';
      const dname = user.displayName.toLowerCase();
      const displayText = mentionSource.resolveMentionDisplay(user.id);
      const fields = [uname, dname].filter(Boolean);
      if (fields.some((f) => f.startsWith(q))) {
        prefix.push({ kind: 'user', id: user.id, user, displayText });
      } else if (fields.some((f) => f.includes(q))) {
        substring.push({ kind: 'user', id: user.id, user, displayText });
      }
    }
    return [...groupMatches, ...prefix, ...substring].slice(0, 5);
  }, [mentionAC, mentionSource]);

  const mentionSuggestionsRef = useRef(mentionSuggestions);
  mentionSuggestionsRef.current = mentionSuggestions;

  const handleMentionDetect = useCallback((text: string, cursorPos: number) => {
    if (!mentionSource) {
      if (mentionACRef.current != null) {
        startTransition(() => setMentionAC(null));
      }
      return;
    }
    const result = detectMentionQuery(text, cursorPos);
    if (sameAcState(mentionACRef.current, result)) return;
    startTransition(() => {
      setMentionAC(result);
      if (result) setMentionAcSelectedIdx(0);
    });
  }, [mentionSource]);

  // --- #page-tag autocomplete ---
  const [pageTagAC, setPageTagAC] = useState<{ query: string; hashIdx: number } | null>(null);
  const [pageTagAcSelectedIdx, setPageTagAcSelectedIdx] = useState(0);
  const pageTagEntriesRef = useRef<TrackedPageTag[]>([]);

  const pageTagACRef = useRef(pageTagAC);
  pageTagACRef.current = pageTagAC;
  const pageTagAcSelectedIdxRef = useRef(pageTagAcSelectedIdx);
  pageTagAcSelectedIdxRef.current = pageTagAcSelectedIdx;

  const handleUpdateMentionOffsets = useCallback((oldText: string, newText: string, cursorPos: number) => {
    mentionEntriesRef.current = updateMentionOffsets(mentionEntriesRef.current, oldText, newText, cursorPos);
    pageTagEntriesRef.current = updatePageTagOffsets(pageTagEntriesRef.current, oldText, newText, cursorPos);
  }, []);

  const pageTagSuggestions = useMemo((): PageTagSuggestion[] => {
    if (!pageTagAC || !pageTagSource) return [];
    const q = pageTagAC.query.toLowerCase();
    const prefix: PageTagSuggestion[] = [];
    const substring: PageTagSuggestion[] = [];
    for (const page of pageTagSource.pages) {
      const displayText = pageTagSource.resolvePageDisplay(page.id);
      const fields = [page.id, displayText.toLowerCase(), ...(page.aliases ?? []).map((a) => a.toLowerCase())];
      if (fields.some((f) => f.startsWith(q))) {
        prefix.push({ id: page.id, displayText, icon: page.icon as PageTagSuggestion['icon'] });
      } else if (fields.some((f) => f.includes(q))) {
        substring.push({ id: page.id, displayText, icon: page.icon as PageTagSuggestion['icon'] });
      }
    }
    return [...prefix, ...substring].slice(0, 5);
  }, [pageTagAC, pageTagSource]);

  const pageTagSuggestionsRef = useRef(pageTagSuggestions);
  pageTagSuggestionsRef.current = pageTagSuggestions;

  const handlePageTagDetect = useCallback((text: string, cursorPos: number) => {
    if (!pageTagSource) {
      if (pageTagACRef.current != null) {
        startTransition(() => setPageTagAC(null));
      }
      return;
    }
    const result = detectPageTagQuery(text, cursorPos);
    if (sameAcState(pageTagACRef.current, result)) return;
    startTransition(() => {
      setPageTagAC(result);
      if (result) setPageTagAcSelectedIdx(0);
    });
  }, [pageTagSource]);

  const acceptMention = useCallback((identityId: string, displayText: string) => {
    const ac = mentionACRef.current;
    if (!ac) return;
    const textarea = inputRef.current!;
    const text = messageTextRef.current;
    const cursor = textarea.selectionStart ?? text.length;
    const insertText = `@${displayText} `;
    const newText = text.slice(0, ac.atIdx) + insertText + text.slice(cursor);
    const newPos = ac.atIdx + insertText.length;

    mentionEntriesRef.current.push({
      identityId,
      offset: ac.atIdx,
      length: insertText.length - 1,
    });

    setMessageText(newText, newPos);
    setMentionAC(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [setMessageText, inputRef, messageTextRef]);

  const acceptPageTag = useCallback((pageId: string, displayText: string) => {
    const ac = pageTagACRef.current;
    if (!ac) return;
    const textarea = inputRef.current!;
    const text = messageTextRef.current;
    const cursor = textarea.selectionStart ?? text.length;
    const insertText = `#${displayText} `;
    const newText = text.slice(0, ac.hashIdx) + insertText + text.slice(cursor);
    const newPos = ac.hashIdx + insertText.length;

    pageTagEntriesRef.current.push({
      pageId,
      offset: ac.hashIdx,
      length: insertText.length - 1,
    });

    setMessageText(newText, newPos);
    setPageTagAC(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [setMessageText, inputRef, messageTextRef]);

  const insertMentionAtCursor = useCallback((identityId: string) => {
    if (!mentionSource) return;
    const displayText = mentionSource.resolveMentionDisplay(identityId);
    const textarea = inputRef.current;
    const text = messageTextRef.current;
    const cursorPos = textarea?.selectionStart ?? text.length;
    const insertText = `@${displayText} `;
    const newText = text.slice(0, cursorPos) + insertText + text.slice(cursorPos);
    const newPos = cursorPos + insertText.length;

    mentionEntriesRef.current.push({
      identityId,
      offset: cursorPos,
      length: insertText.length - 1,
    });

    setMessageText(newText, newPos);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(newPos, newPos);
    });
  }, [mentionSource, setMessageText, inputRef, messageTextRef]);

  useEffect(() => {
    if (mentionInsertRef) mentionInsertRef.current = insertMentionAtCursor;
    return () => { if (mentionInsertRef) mentionInsertRef.current = null; };
  }, [mentionInsertRef, insertMentionAtCursor]);

  const handleShortcodeSelect = useCallback((_code: string, emoji: string) => {
    const textarea = inputRef.current!;
    const text = messageTextRef.current;
    const cursor = textarea.selectionStart ?? text.length;
    const ac = shortcodeACRef.current!;
    const newText = text.slice(0, ac.colonIdx) + emoji + text.slice(cursor);
    const newPos = ac.colonIdx + emoji.length;
    setMessageText(newText, newPos);
    setShortcodeAC(null);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [setMessageText, inputRef, messageTextRef]);

  const handleAutocompleteKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    const mAc = mentionACRef.current;
    const mSuggestions = mentionSuggestionsRef.current;
    if (mAc && mSuggestions.length > 0) {
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const s = mSuggestions[mentionAcSelectedIdxRef.current]!;
        acceptMention(s.id, s.displayText);
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionAcSelectedIdx((prev) => (prev + 1) % mSuggestions.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionAcSelectedIdx((prev) => (prev - 1 + mSuggestions.length) % mSuggestions.length);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionAC(null);
        return true;
      }
    }

    const ptAc = pageTagACRef.current;
    const ptSuggestions = pageTagSuggestionsRef.current;
    if (ptAc && ptSuggestions.length > 0) {
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const s = ptSuggestions[pageTagAcSelectedIdxRef.current]!;
        acceptPageTag(s.id, s.displayText);
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPageTagAcSelectedIdx((prev) => (prev + 1) % ptSuggestions.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPageTagAcSelectedIdx((prev) => (prev - 1 + ptSuggestions.length) % ptSuggestions.length);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPageTagAC(null);
        return true;
      }
    }

    const ac = shortcodeACRef.current;
    const suggestions = acSuggestionsRef.current;
    if (ac && suggestions.length > 0) {
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const selected = suggestions[acSelectedIdxRef.current]!;
        const insertText = Array.isArray(selected) ? selected[1] : `:${selected.emoji.shortcode}:`;
        const textarea = inputRef.current!;
        const text = messageTextRef.current;
        const cursor = textarea.selectionStart ?? text.length;
        const newText = text.slice(0, ac.colonIdx) + insertText + text.slice(cursor);
        const newPos = ac.colonIdx + insertText.length;
        setMessageText(newText, newPos);
        setShortcodeAC(null);
        requestAnimationFrame(() => {
          textarea.focus();
          textarea.setSelectionRange(newPos, newPos);
        });
        return true;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAcSelectedIdx((prev) => (prev + 1) % suggestions.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAcSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShortcodeAC(null);
        return true;
      }
    }

    return false;
  }, [acceptMention, acceptPageTag, setMessageText, inputRef, messageTextRef]);

  return {
    acSuggestions,
    acSelectedIdx,
    mentionSuggestions,
    mentionAcSelectedIdx,
    pageTagSuggestions,
    pageTagAcSelectedIdx,
    mentionEntriesRef,
    pageTagEntriesRef,
    handleShortcodeDetect,
    handleMentionDetect,
    handlePageTagDetect,
    handleUpdateMentionOffsets,
    acceptMention,
    acceptPageTag,
    insertMentionAtCursor,
    handleShortcodeSelect,
    handleAutocompleteKeyDown,
  };
}
