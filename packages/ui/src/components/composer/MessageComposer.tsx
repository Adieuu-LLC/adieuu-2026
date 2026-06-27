import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Portal, Menu } from '@ark-ui/react';
import { convertShortcodes, SHORTCODE_ENTRIES } from '../../utils/emojiShortcodes';
import {
  serializePayload,
  gifPayload,
  buildCustomEmojiPayloadMap,
  type MentionEntity,
  type PageTagEntity,
  type GifAttachment,
} from '../../services/messagePayload';
import { getOrCreateDeviceId } from '../../services/deviceInfo';
import { createApiClient, CONV_MEDIA_BASE_MAX_BYTES, type PublicCustomEmoji } from '@adieuu/shared';
import { EmojiPicker, type EmojiSelectResult } from '../EmojiPicker';
import { GifPicker, type ContentTab } from '../GifPicker';
import { Tooltip } from '../Tooltip';
import { useToast } from '../Toast';
import { Icon } from '../../icons/Icon';
import { copyPlainTextToClipboard, readPlainTextFromClipboard } from '../../utils/contextMenuClipboard';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { useIdentity } from '../../hooks/useIdentity';
import type {
  ComposerSendFn,
  ComposerReplyContext,
  MentionSource,
  PageTagSource,
  PendingAttachment,
  TrackedMention,
  TrackedPageTag,
  ComposerControlConfig,
} from './composerTypes';
import {
  MENTION_EVERYONE_ID,
  MENTION_HERE_ID,
  resolveConversationComposerMediaMaxBytes,
  MAX_ATTACHMENTS,
  PLACEHOLDER_VERB_KEYS,
} from './composerTypes';
import {
  gatherConversationMediaFromDataTransfer,
  gatherConversationMediaFromFileList,
  readClipboardMediaFilesViaApi,
  shouldInterceptPasteForMediaInspection,
  clipboardPasteSuggestsNonPlainMedia,
} from './conversationMediaFromClipboard';
import { detectShortcodeQuery, detectMentionQuery, detectPageTagQuery, updateMentionOffsets, updatePageTagOffsets, resolveMentionedIdentityIds } from './composerUtils';
import { runGifSendNow } from './composerGifSendNow';
import { ComposerAttachments } from './ComposerAttachments';
import { ComposerShortcodeAutocomplete, ComposerMentionAutocomplete, ComposerPageTagAutocomplete, type MentionSuggestion, type PageTagSuggestion } from './ComposerAutocomplete';
import { ComposerTTLMenu } from './ComposerTTLMenu';
import { ComposerSendIcon } from './ComposerSendIcon';
import { useComposerFieldInsets } from './useComposerFieldInsets';
import { useMediaOutbox } from '../../services/mediaOutbox';
import {
  getComposerControlsBySide,
  useComposerControlsPreference,
} from '../../hooks/useComposerControlsPreference';

type ShortcodeSuggestion = [string, string] | { type: 'custom'; emoji: PublicCustomEmoji };

function acSuggestionKey(s: ShortcodeSuggestion | undefined): string {
  if (!s) return '';
  return Array.isArray(s) ? s[0] : s.emoji.shortcode;
}

export type MessageComposerHandle = {
  /** Add image/video files using the same validation as the attach button (sniffing, caps). */
  addMediaFiles: (files: FileList | File[]) => void;
};

export type MessageComposerProps = {
  channelId: string;
  sending: boolean;
  onSend: ComposerSendFn;
  forwardSecrecy?: { enabled: boolean; onToggle: () => void };
  replyContext?: ComposerReplyContext | null;
  onSendSucceeded?: () => void;
  mentionSource?: MentionSource;
  pageTagSource?: PageTagSource;
  placeholder?: string;
  placeholderTarget?: string;
  mentionInsertRef?: React.MutableRefObject<((identityId: string) => void) | null>;
  gifsDisabled?: boolean;
  customEmojisDisabled?: boolean;
  customEmojis?: PublicCustomEmoji[];
  /** Plain-text of the most recent conversation message (for sticker search seeding). */
  lastMessageText?: string;
  /** When true, disables all input and hides action buttons (e.g. when conversation is blocked). */
  disabled?: boolean;
  /** When set, the composer is in “edit message” mode (text-only; send updates the message). */
  editContext?: { messageId: string; onCancel: () => void } | null;
  /**
   * When this value changes, the input is replaced with `editingInitialPlaintext` (for edit mode).
   * Use a stable value like the message id or a monotonic key.
   */
  editingMessageKey?: string | null;
  /** Plain text (plus shortcodes) to load when entering edit mode. */
  editingInitialPlaintext?: string;
  /** When true, conversation allows participants to skip moderation per-send. */
  allowSkipModeration?: boolean;
};

export const MessageComposer = forwardRef<MessageComposerHandle, MessageComposerProps>(function MessageComposer(
  {
  channelId,
  sending,
  onSend,
  forwardSecrecy,
  replyContext,
  onSendSucceeded,
  mentionSource,
  pageTagSource,
  placeholder: placeholderOverride,
  placeholderTarget,
  mentionInsertRef,
  gifsDisabled,
  customEmojisDisabled,
  customEmojis,
  lastMessageText,
  disabled,
  editContext,
  editingMessageKey,
  editingInitialPlaintext,
  allowSkipModeration,
}: MessageComposerProps,
  ref,
) {
  const { t } = useTranslation();
  const { warning: toastWarning, error: toastError } = useToast();
  const { apiBaseUrl } = useAppConfig();
  const { status: authStatus, session: authSession } = useAuth();
  const { status: identityStatus } = useIdentity();
  const skipComposerFocus = identityStatus === 'locked';
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const conversationMediaMaxBytes = useMemo(
    () =>
      authStatus === 'identity_mode' && authSession
        ? resolveConversationComposerMediaMaxBytes({
            subscriptions: authSession.subscriptions ?? [],
            entitlements: authSession.entitlements ?? [],
            isLifetime: authSession.isLifetime ?? false,
          })
        : CONV_MEDIA_BASE_MAX_BYTES,
    [authStatus, authSession],
  );
  const conversationMediaGatherOpts = useMemo(
    () => ({ maxBytes: conversationMediaMaxBytes }),
    [conversationMediaMaxBytes],
  );
  const { enqueueMediaSend } = useMediaOutbox();

  useEffect(() => {
    void import('../../utils/videoTranscode').then((m) => m.preloadFfmpegCore());
  }, []);

  const placeholder = useMemo(() => {
    if (placeholderOverride) return placeholderOverride;
    if (!placeholderTarget) return t('conversations.messagePlaceholder');
    const key = PLACEHOLDER_VERB_KEYS[Math.floor(Math.random() * PLACEHOLDER_VERB_KEYS.length)]!;
    const verb = t(`conversations.placeholderVerbs.${key}` as const);
    return `${verb} ${placeholderTarget}...`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, placeholderTarget, placeholderOverride, t]);

  const [messageText, setMessageTextRaw] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [lastMediaTab, setLastMediaTab] = useState<ContentTab>('gifs');
  const [pendingGif, setPendingGif] = useState<GifAttachment | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [stripExif, setStripExif] = useState(true);
  const [moderationEnabled, setModerationEnabled] = useState(true);
  const [sendMp4WithoutReencode, setSendMp4WithoutReencode] = useState(false);
  const [ttlSeconds, setTtlSeconds] = useState<number | undefined>(undefined);
  const [shortcodeAC, setShortcodeAC] = useState<{ query: string; colonIdx: number } | null>(null);
  const [acSelectedIdx, setAcSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const leftControlsRef = useRef<HTMLDivElement>(null);
  const rightControlsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTextRef = useRef(messageText);
  messageTextRef.current = messageText;

  const videoAttachments = useMemo(
    () => attachments.filter((a) => a.file.type.startsWith('video/')),
    [attachments]
  );
  const allVideosAreMp4 =
    videoAttachments.length > 0 && videoAttachments.every((a) => a.file.type === 'video/mp4');

  useEffect(() => {
    if (!allVideosAreMp4) setSendMp4WithoutReencode(false);
  }, [allVideosAreMp4]);

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
    setShortcodeAC(result);
    if (result) setAcSelectedIdx(0);
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
    if (!mentionSource) { setMentionAC(null); return; }
    const result = detectMentionQuery(text, cursorPos);
    setMentionAC(result);
    if (result) setMentionAcSelectedIdx(0);
  }, [mentionSource]);

  const handleUpdateMentionOffsets = useCallback((oldText: string, newText: string, cursorPos: number) => {
    mentionEntriesRef.current = updateMentionOffsets(mentionEntriesRef.current, oldText, newText, cursorPos);
    pageTagEntriesRef.current = updatePageTagOffsets(pageTagEntriesRef.current, oldText, newText, cursorPos);
  }, []);

  // --- #page-tag autocomplete ---
  const [pageTagAC, setPageTagAC] = useState<{ query: string; hashIdx: number } | null>(null);
  const [pageTagAcSelectedIdx, setPageTagAcSelectedIdx] = useState(0);
  const pageTagEntriesRef = useRef<TrackedPageTag[]>([]);

  const pageTagACRef = useRef(pageTagAC);
  pageTagACRef.current = pageTagAC;
  const pageTagAcSelectedIdxRef = useRef(pageTagAcSelectedIdx);
  pageTagAcSelectedIdxRef.current = pageTagAcSelectedIdx;

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
    if (!pageTagSource) { setPageTagAC(null); return; }
    const result = detectPageTagQuery(text, cursorPos);
    setPageTagAC(result);
    if (result) setPageTagAcSelectedIdx(0);
  }, [pageTagSource]);

  // --- Undo / redo history ---
  const undoStack = useRef<{ text: string; cursor: number }[]>([{ text: '', cursor: 0 }]);
  const redoStack = useRef<{ text: string; cursor: number }[]>([]);
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
  }, [setMessageText]);

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
  }, [setMessageText]);

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
  }, [mentionSource, setMessageText]);

  useEffect(() => {
    if (mentionInsertRef) mentionInsertRef.current = insertMentionAtCursor;
    return () => { if (mentionInsertRef) mentionInsertRef.current = null; };
  }, [mentionInsertRef, insertMentionAtCursor]);

  // --- Composer mini-toast ---
  const [composerToast, setComposerToast] = useState<string | null>(null);
  const composerToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showComposerToast = useCallback((label: string) => {
    if (composerToastTimer.current) clearTimeout(composerToastTimer.current);
    setComposerToast(label);
    composerToastTimer.current = setTimeout(() => setComposerToast(null), 1500);
  }, []);

  const warnAttachmentTooLarge = useCallback(() => {
    const maxMb = Math.round(conversationMediaMaxBytes / (1024 * 1024));
    toastWarning(
      t('conversations.fileTooLarge', 'File too large'),
      t('conversations.fileTooLargeDesc', 'Attachments must be under {{maxMb}} MB.', { maxMb }),
    );
  }, [toastWarning, t, conversationMediaMaxBytes]);

  const commitMediaFilesToAttachments = useCallback(
    (files: File[], options?: { toastLabel?: string }) => {
      if (files.length === 0) return;
      if (options?.toastLabel) {
        showComposerToast(options.toastLabel);
      }
      setAttachments((prev) => {
        const remaining = MAX_ATTACHMENTS - prev.length;
        if (remaining <= 0) return prev;
        const toAdd = files.slice(0, remaining).map((file) => ({
          file,
          previewUrl: URL.createObjectURL(file),
          uploadStatus: 'pending' as const,
          uploadProgress: 0,
        }));
        return [...prev, ...toAdd];
      });
    },
    [showComposerToast],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      void (async () => {
        const { files: resolved, oversized } = await gatherConversationMediaFromFileList(
          files,
          conversationMediaGatherOpts,
        );
        if (oversized) warnAttachmentTooLarge();
        if (resolved.length > 0) {
          commitMediaFilesToAttachments(resolved, { toastLabel: t('conversations.pasted', 'Pasted') });
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
      })();
    },
    [commitMediaFilesToAttachments, warnAttachmentTooLarge, t, conversationMediaGatherOpts],
  );

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1);
      for (const a of removed) URL.revokeObjectURL(a.previewUrl);
      return next;
    });
  }, []);

  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.previewUrl);
    };
  }, []);

  useEffect(() => {
    if (skipComposerFocus) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [channelId, skipComposerFocus]);

  useEffect(() => {
    if (skipComposerFocus) return;
    if (!sending) {
      inputRef.current?.focus();
    }
  }, [sending, skipComposerFocus]);

  useEffect(() => {
    if (skipComposerFocus) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [replyContext, skipComposerFocus]);

  const prevEditKey = useRef<string | null>(null);
  useEffect(() => {
    if (editContext && editingMessageKey) {
      if (prevEditKey.current !== editingMessageKey) {
        setMessageText(editingInitialPlaintext ?? '', (editingInitialPlaintext ?? '').length);
        mentionEntriesRef.current = [];
        pageTagEntriesRef.current = [];
        prevEditKey.current = editingMessageKey;
        window.requestAnimationFrame(() => {
          const ta = inputRef.current;
          if (ta) {
            ta.focus();
            const len = ta.value.length;
            ta.setSelectionRange(len, len);
          }
        });
      }
    } else if (prevEditKey.current !== null) {
      setMessageText('', 0);
      mentionEntriesRef.current = [];
      prevEditKey.current = null;
    }
  }, [editContext, editingMessageKey, editingInitialPlaintext, setMessageText]);

  const [isMultiLine, setIsMultiLine] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const verticalPadding =
      parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    const singleLineH = Math.ceil(lineHeight + verticalPadding);
    // When empty, a wrapping placeholder can inflate scrollHeight beyond what
    // a single line needs -- cap to single-line height so the composer stays compact.
    const effectiveH = messageText ? scrollH : Math.min(scrollH, singleLineH);
    el.style.height = `${effectiveH}px`;
    const multi = effectiveH > singleLineH + 2;
    setIsMultiLine(multi);
    el.style.overflowY = effectiveH >= 500 ? 'auto' : 'hidden';
  }, [messageText]);

  const handleSend = useCallback(async () => {
    if (disabled) return;
    const text = messageTextRef.current.trim();
    if (!channelId || (!text && attachments.length === 0 && !pendingGif) || sending) return;

    if (editContext && (attachments.length > 0 || pendingGif)) {
      toastError(t('conversations.editNoAttachments'));
      return;
    }

    const currentPendingGif = pendingGif;
    const pendingAttachments = [...attachments];
    const currentMentions = [...mentionEntriesRef.current];
    const currentPageTags = [...pageTagEntriesRef.current];
    setMessageText('');
    setPendingGif(null);
    mentionEntriesRef.current = [];
    pageTagEntriesRef.current = [];
    undoStack.current = [{ text: '', cursor: 0 }];
    redoStack.current = [];

    if (currentPendingGif) {
      const convertedText = convertShortcodes(text) || undefined;
      const payload = gifPayload(convertedText, currentPendingGif);
      const customEmojiMap = buildCustomEmojiPayloadMap(
        convertedText ?? '',
        customEmojis,
        customEmojisDisabled === true,
      );
      if (customEmojiMap && Object.keys(customEmojiMap).length > 0) {
        payload.customEmojis = customEmojiMap;
      }
      const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      if (mentions.length > 0) payload.mentions = mentions;
      const pageTags: PageTagEntity[] = currentPageTags.map((p) => ({ id: p.pageId, offset: p.offset, length: p.length }));
      if (pageTags.length > 0) payload.pageTags = pageTags;
      payload.senderDeviceId = getOrCreateDeviceId();
      const plaintext = serializePayload(payload);

      const mentionedIdentityIds = resolveMentionedIdentityIds(mentions, mentionSource);

      api.klipy.share({
        slug: currentPendingGif.slug,
        type: currentPendingGif.type,
        searchTerm: currentPendingGif.searchTerm || undefined,
      });

      const sent = await onSend(plaintext, {
        ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
        ...(replyContext ? { replyToMessageId: replyContext.messageId } : {}),
        ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
        mentionedIdentityIds,
      });
      replyContext?.onCancel();
      if (sent != null) {
        onSendSucceeded?.();
      }
      inputRef.current?.focus();
      return;
    }

    if (pendingAttachments.length > 0) {
      try {
        await enqueueMediaSend({
          conversationId: channelId,
          caption: text,
          mentions: currentMentions,
          pageTags: currentPageTags,
          mentionedIdentityIds: resolveMentionedIdentityIds(
            currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length })),
            mentionSource,
          ),
          replyToMessageId: replyContext?.messageId,
          ttlSeconds,
          useForwardSecrecy: forwardSecrecy?.enabled ?? false,
          stripExif,
          moderationEnabled,
          ...(sendMp4WithoutReencode && allVideosAreMp4 ? { sendMp4WithoutReencode: true } : {}),
          ...(customEmojis?.length && !customEmojisDisabled
            ? { composerCustomEmojisSnapshotJson: JSON.stringify(customEmojis) }
            : {}),
          files: pendingAttachments.map((a) => a.file),
        });
      } catch (err) {
        console.error('[Composer] Media outbox enqueue failed:', err);
        toastError(
          t('conversations.uploadFailed', 'Upload failed'),
          err instanceof Error ? err.message : t('conversations.uploadFailedDesc', 'One or more attachments could not be uploaded.'),
        );
        return;
      }

      replyContext?.onCancel();
      setSendMp4WithoutReencode(false);
      setAttachments((prev) => {
        for (const a of prev) URL.revokeObjectURL(a.previewUrl);
        return [];
      });
      inputRef.current?.focus();
    } else {
      const convertedText = convertShortcodes(text);
      const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      const pageTags: PageTagEntity[] = currentPageTags.map((p) => ({ id: p.pageId, offset: p.offset, length: p.length }));
      const mentionedIdentityIds = resolveMentionedIdentityIds(mentions, mentionSource);
      const senderDeviceId = getOrCreateDeviceId();

      const customEmojiMap = buildCustomEmojiPayloadMap(
        convertedText,
        customEmojis,
        customEmojisDisabled === true,
      );

      const plaintext = serializePayload({
        version: 1,
        text: convertedText,
        ...(mentions.length > 0 ? { mentions } : {}),
        ...(pageTags.length > 0 ? { pageTags } : {}),
        ...(customEmojiMap ? { customEmojis: customEmojiMap } : {}),
        senderDeviceId,
      });
      if (editContext) {
        const sent = await onSend(plaintext, {
          ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
        });
        if (sent != null) {
          onSendSucceeded?.();
        }
        inputRef.current?.focus();
      } else {
        const sent = await onSend(plaintext, {
          ...(forwardSecrecy?.enabled ? { useForwardSecrecy: true } : {}),
          ...(replyContext ? { replyToMessageId: replyContext.messageId } : {}),
          ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
          mentionedIdentityIds,
        });
        replyContext?.onCancel();
        if (sent != null) {
          onSendSucceeded?.();
        }
        inputRef.current?.focus();
      }
    }
  }, [
    disabled,
    channelId,
    sending,
    onSend,
    forwardSecrecy,
    replyContext,
    editContext,
    onSendSucceeded,
    attachments,
    pendingGif,
    stripExif,
    moderationEnabled,
    sendMp4WithoutReencode,
    allVideosAreMp4,
    api,
    toastError,
    t,
    ttlSeconds,
    enqueueMediaSend,
    customEmojis,
    customEmojisDisabled,
    mentionSource,
  ]);

  const handleCopy = useCallback(() => {
    showComposerToast(t('conversations.copied', 'Copied'));
  }, [showComposerToast, t]);

  const insertPlainTextAtCaret = useCallback(
    (inserted: string) => {
      const ta = inputRef.current;
      if (!ta || disabled) {
        return;
      }
      const oldText = messageTextRef.current;
      const start = ta.selectionStart ?? 0;
      const end = ta.selectionEnd ?? oldText.length;
      const newText = oldText.slice(0, start) + inserted + oldText.slice(end);
      const newPos = start + inserted.length;
      handleUpdateMentionOffsets(oldText, newText, newPos);
      setMessageText(newText, newPos);
      handleShortcodeDetect(newText, newPos);
      handleMentionDetect(newText, newPos);
      handlePageTagDetect(newText, newPos);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(newPos, newPos);
      });
    },
    [disabled, handleMentionDetect, handlePageTagDetect, handleShortcodeDetect, setMessageText, handleUpdateMentionOffsets],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const cd = e.clipboardData;
      if (!cd) return;

      if (!shouldInterceptPasteForMediaInspection(cd)) {
        let hasTextData = false;
        for (const item of Array.from(cd.items)) {
          if (item.type === 'text/plain') hasTextData = true;
        }
        if (hasTextData) showComposerToast(t('conversations.pasted', 'Pasted'));
        return;
      }

      e.preventDefault();
      const textFallback = cd.getData('text/plain');
      void (async () => {
        let { files, oversized } = await gatherConversationMediaFromDataTransfer(cd, conversationMediaGatherOpts);
        if (files.length === 0 && !oversized) {
          const apiRes = await readClipboardMediaFilesViaApi(conversationMediaGatherOpts);
          files = apiRes.files;
          oversized = oversized || apiRes.oversized;
        }
        if (oversized) warnAttachmentTooLarge();
        if (files.length > 0) {
          commitMediaFilesToAttachments(files, { toastLabel: t('conversations.pasted', 'Pasted') });
          return;
        }
        if (textFallback) {
          insertPlainTextAtCaret(textFallback);
          showComposerToast(t('conversations.pasted', 'Pasted'));
          return;
        }
        if (!oversized && clipboardPasteSuggestsNonPlainMedia(cd)) {
          toastWarning(
            t('conversations.pasteMediaUnreadableTitle', 'Could not use clipboard content'),
            t(
              'conversations.pasteMediaUnreadableDesc',
              'We noticed a paste that may include an image or video, but could not read usable media. Try saving the file and attaching it, or copying from another app.',
            ),
          );
        }
      })();
    },
    [
      showComposerToast,
      t,
      toastWarning,
      warnAttachmentTooLarge,
      commitMediaFilesToAttachments,
      insertPlainTextAtCaret,
      conversationMediaGatherOpts,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      addMediaFiles: (list: FileList | File[]) => {
        if (disabled || sending) return;
        void (async () => {
          const { files: resolved, oversized } = await gatherConversationMediaFromFileList(
            list,
            conversationMediaGatherOpts,
          );
          if (oversized) warnAttachmentTooLarge();
          if (resolved.length > 0) {
            commitMediaFilesToAttachments(resolved, { toastLabel: t('conversations.pasted', 'Pasted') });
          }
        })();
      },
    }),
    [disabled, sending, warnAttachmentTooLarge, commitMediaFilesToAttachments, t, conversationMediaGatherOpts],
  );

  const handleComposerContextMenu = useCallback(
    async (details: { value: string | null }) => {
      const v = details.value;
      if (v === 'copy') {
        const ta = inputRef.current;
        const text = messageTextRef.current;
        if (!ta) {
          return;
        }
        const a = ta.selectionStart ?? 0;
        const b = ta.selectionEnd ?? text.length;
        const sel = text.slice(a, b);
        if (!sel) {
          return;
        }
        const ok = await copyPlainTextToClipboard(sel);
        if (ok) {
          showComposerToast(t('conversations.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (v === 'copy-all') {
        const ok = await copyPlainTextToClipboard(messageText);
        if (ok) {
          showComposerToast(t('conversations.copied', 'Copied'));
        } else {
          toastError(t('conversations.contextMenu.copyFailed', 'Could not copy to clipboard'));
        }
        return;
      }
      if (v === 'select-all') {
        const ta = inputRef.current;
        if (!ta) {
          return;
        }
        ta.focus();
        const len = messageTextRef.current.length;
        requestAnimationFrame(() => {
          ta.setSelectionRange(0, len);
        });
        return;
      }
      if (v === 'paste') {
        const pasted = await readPlainTextFromClipboard();
        if (pasted != null && pasted.length > 0) {
          insertPlainTextAtCaret(pasted);
          showComposerToast(t('conversations.pasted', 'Pasted'));
          return;
        }
        const { files: clipFiles, oversized: clipOversized } =
          await readClipboardMediaFilesViaApi(conversationMediaGatherOpts);
        if (clipOversized) {
          warnAttachmentTooLarge();
        }
        if (clipFiles.length > 0) {
          commitMediaFilesToAttachments(clipFiles, { toastLabel: t('conversations.pasted', 'Pasted') });
          return;
        }
        if (pasted == null) {
          toastError(t('conversations.contextMenu.pasteFailed', 'Could not paste from clipboard'));
          return;
        }
        toastWarning(
          t('conversations.pasteMediaUnreadableTitle', 'Could not use clipboard content'),
          t(
            'conversations.pasteMediaUnreadableDesc',
            'We noticed a paste that may include an image or video, but could not read usable media. Try saving the file and attaching it, or copying from another app.',
          ),
        );
      }
    },
    [
      insertPlainTextAtCaret,
      messageText,
      t,
      showComposerToast,
      toastError,
      toastWarning,
      warnAttachmentTooLarge,
      commitMediaFilesToAttachments,
      conversationMediaGatherOpts,
    ],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const mAc = mentionACRef.current;
      const mSuggestions = mentionSuggestionsRef.current;
      if (mAc && mSuggestions.length > 0) {
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          const s = mSuggestions[mentionAcSelectedIdxRef.current]!;
          acceptMention(s.id, s.displayText);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionAcSelectedIdx((prev) => (prev + 1) % mSuggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionAcSelectedIdx((prev) => (prev - 1 + mSuggestions.length) % mSuggestions.length);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionAC(null);
          return;
        }
      }

      const ptAc = pageTagACRef.current;
      const ptSuggestions = pageTagSuggestionsRef.current;
      if (ptAc && ptSuggestions.length > 0) {
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          const s = ptSuggestions[pageTagAcSelectedIdxRef.current]!;
          acceptPageTag(s.id, s.displayText);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setPageTagAcSelectedIdx((prev) => (prev + 1) % ptSuggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setPageTagAcSelectedIdx((prev) => (prev - 1 + ptSuggestions.length) % ptSuggestions.length);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setPageTagAC(null);
          return;
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
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setAcSelectedIdx((prev) => (prev + 1) % suggestions.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setAcSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setShortcodeAC(null);
          return;
        }
      }

      if (e.key === 'Escape' && editContext) {
        e.preventDefault();
        editContext.onCancel();
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
        return;
      }

      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.current.length <= 1) return;
        const current = undoStack.current.pop()!;
        redoStack.current.push(current);
        const prev = undoStack.current[undoStack.current.length - 1]!;
        setMessageTextRaw(prev.text);
        messageTextRef.current = prev.text;
        requestAnimationFrame(() => {
          inputRef.current?.setSelectionRange(prev.cursor, prev.cursor);
        });
        return;
      }
      if (isMod && (e.key === 'y' || (e.key === 'z' && e.shiftKey) || (e.key === 'Z'))) {
        e.preventDefault();
        if (redoStack.current.length === 0) return;
        const next = redoStack.current.pop()!;
        undoStack.current.push(next);
        setMessageTextRaw(next.text);
        messageTextRef.current = next.text;
        requestAnimationFrame(() => {
          inputRef.current?.setSelectionRange(next.cursor, next.cursor);
        });
        return;
      }
    },
    [handleSend, setMessageText, acceptMention, acceptPageTag, editContext]
  );

  const handleGifSelect = useCallback((gif: GifAttachment) => {
    setPendingGif(gif);
    setShowMediaPicker(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const handleGifSendNow = useCallback(
    (gif: GifAttachment) => {
      if (disabled || !channelId || sending) return;
      setShowMediaPicker(false);

      runGifSendNow({
        gif,
        onSend,
        klipyShare: (params) => api.klipy.share(params),
        forwardSecrecyEnabled: forwardSecrecy?.enabled,
        replyToMessageId: replyContext?.messageId,
        replyOnCancel: replyContext?.onCancel,
        ttlSeconds,
        onSendSucceeded,
        focusInput: () => inputRef.current?.focus(),
      });
    },
    [disabled, channelId, sending, onSend, forwardSecrecy, replyContext, ttlSeconds, onSendSucceeded, api],
  );

  const handleEmojiSelect = useCallback((result: EmojiSelectResult) => {
    const inserted = result.native
      ? result.native
      : result.custom
        ? `:${result.custom.shortcode}:`
        : '';
    if (!inserted) return;
    const textarea = inputRef.current;
    if (!textarea) {
      setMessageText(messageTextRef.current + inserted);
      return;
    }
    const current = messageTextRef.current;
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const newPos = start + inserted.length;
    setMessageText(current.slice(0, start) + inserted + current.slice(end), newPos);
    setShowEmojiPicker(false);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newPos, newPos);
    });
  }, [setMessageText]);

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
  }, [setMessageText]);

  const composerControls = useComposerControlsPreference();
  const leftControls = useMemo(
    () => getComposerControlsBySide(composerControls, 'left'),
    [composerControls],
  );
  const rightControls = useMemo(
    () => getComposerControlsBySide(composerControls, 'right'),
    [composerControls],
  );
  const fieldInsetsRemeasureKey = useMemo(
    () => JSON.stringify({
      disabled,
      composerControls,
      hasForwardSecrecy: !!forwardSecrecy,
      gifsDisabled: !!gifsDisabled,
    }),
    [disabled, composerControls, forwardSecrecy, gifsDisabled],
  );
  const fieldInsets = useComposerFieldInsets(leftControlsRef, rightControlsRef, fieldInsetsRemeasureKey);
  const canSendMessage =
    !!channelId &&
    !disabled &&
    !sending &&
    (!!messageText.trim() || attachments.length > 0 || !!pendingGif);

  const renderComposerControl = useCallback(
    (control: ComposerControlConfig) => {
      switch (control.id) {
        case 'forwardSecrecy':
          if (!forwardSecrecy) return null;
          return (
            <Tooltip
              key={control.id}
              content={
                forwardSecrecy.enabled
                  ? t('conversations.fsEnabled', 'Forward secrecy is on for this message')
                  : t('conversations.fsDisabled', 'Forward secrecy is off for this message')
              }
              position="top"
            >
              <button
                type="button"
                className={`conversation-fs-toggle${forwardSecrecy.enabled ? ' conversation-fs-toggle--active' : ''}`}
                onClick={() => {
                  forwardSecrecy.onToggle();
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
              >
                FS
              </button>
            </Tooltip>
          );
        case 'timedMessage':
          return (
            <ComposerTTLMenu
              key={control.id}
              ttlSeconds={ttlSeconds}
              onSelect={setTtlSeconds}
              onAfterSelect={() => requestAnimationFrame(() => inputRef.current?.focus())}
            />
          );
        case 'upload':
          return (
            <Tooltip key={control.id} content={t('conversations.attachMedia')} position="top">
              <button
                type="button"
                className="conversation-attach-btn"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || attachments.length >= MAX_ATTACHMENTS}
              >
                <Icon name="upload" />
              </button>
            </Tooltip>
          );
        case 'gif':
          if (gifsDisabled) return null;
          return (
            <Popover.Root
              key={control.id}
              open={showMediaPicker}
              onOpenChange={(e) => setShowMediaPicker(e.open)}
              positioning={{ placement: 'top-end' }}
              lazyMount
              unmountOnExit
            >
              <Popover.Anchor asChild>
                <span className="composer-popover-anchor">
                  <Tooltip content={t('gif.composerButtonCombined', 'GIFs and Stickers')} position="top">
                    <Popover.Trigger asChild>
                      <button
                        type="button"
                        className="conversation-media-btn"
                        disabled={sending}
                      >
                        <span className="conversation-media-btn__label">GIF</span>
                      </button>
                    </Popover.Trigger>
                  </Tooltip>
                </span>
              </Popover.Anchor>
              <Portal>
                <Popover.Positioner>
                  <Popover.Content className="gif-picker-popover">
                    <GifPicker
                      onGifSelect={handleGifSelect}
                      onGifSendNow={handleGifSendNow}
                      initialTab={lastMediaTab}
                      onTabChange={setLastMediaTab}
                      lastMessageText={lastMessageText}
                      conversationId={channelId}
                    />
                  </Popover.Content>
                </Popover.Positioner>
              </Portal>
            </Popover.Root>
          );
        case 'emoji':
          return (
            <Popover.Root
              key={control.id}
              open={showEmojiPicker}
              onOpenChange={(e) => setShowEmojiPicker(e.open)}
              positioning={{ placement: 'top-end' }}
              lazyMount
              unmountOnExit
            >
              <Popover.Anchor asChild>
                <span className="composer-popover-anchor">
                  <Tooltip content={t('conversations.emojiButton', 'Emoji')} position="top">
                    <Popover.Trigger asChild>
                      <button type="button" className="message-composer-emoji-btn">
                        <Icon name="smile" className="message-composer-emoji-icon" />
                      </button>
                    </Popover.Trigger>
                  </Tooltip>
                </span>
              </Popover.Anchor>
              <Portal>
                <Popover.Positioner>
                  <Popover.Content className="emoji-picker-popover">
                    <EmojiPicker
                      onEmojiSelect={handleEmojiSelect}
                      customEmojis={!customEmojisDisabled ? customEmojis : undefined}
                    />
                  </Popover.Content>
                </Popover.Positioner>
              </Portal>
            </Popover.Root>
          );
        case 'send':
          return (
            <Tooltip key={control.id} content={t('conversations.send', 'Send')} position="top">
              <button
                type="button"
                className="conversation-composer-send-btn"
                onClick={() => void handleSend()}
                disabled={!canSendMessage}
                aria-label={t('conversations.send', 'Send')}
              >
                {control.sendShowText && (
                  <span className="conversation-composer-send-btn__label">
                    {t('conversations.send', 'Send')}
                  </span>
                )}
                <ComposerSendIcon icon={control.sendIcon ?? 'paper-plane'} />
              </button>
            </Tooltip>
          );
        default:
          return null;
      }
    },
    [
      forwardSecrecy,
      t,
      ttlSeconds,
      sending,
      attachments.length,
      gifsDisabled,
      showMediaPicker,
      handleGifSelect,
      handleGifSendNow,
      lastMediaTab,
      lastMessageText,
      channelId,
      showEmojiPicker,
      handleEmojiSelect,
      customEmojisDisabled,
      customEmojis,
      handleSend,
      canSendMessage,
    ],
  );

  return (
    <Menu.Root
      onSelect={(d) => {
        void handleComposerContextMenu({ value: d.value as string | null });
      }}
    >
      <Menu.ContextTrigger asChild>
        <div className={`conversation-composer${disabled ? ' conversation-composer--disabled' : ''}`}>
      {composerToast && (
        <div className="conversation-composer-mini-toast" role="status" aria-live="polite">
          {composerToast}
        </div>
      )}
      {editContext && (
        <div className="conversation-composer-reply">
          <Icon name="pen" className="conversation-composer-reply-icon" />
          <span className="conversation-composer-reply-text" title={t('conversations.editingMessage')}>
            {t('conversations.editingMessage')}
          </span>
          <button
            type="button"
            className="conversation-composer-reply-cancel"
            onClick={editContext.onCancel}
            aria-label={t('conversations.cancelEdit')}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
      {!editContext && replyContext && (
        <div className="conversation-composer-reply">
          <Icon name="reply" className="conversation-composer-reply-icon" />
          <button
            type="button"
            className="conversation-composer-reply-text"
            title={`${replyContext.authorName}: ${replyContext.snippet}`}
            onClick={replyContext.onClick}
          >
            {replyContext.authorName}: {replyContext.snippet}
          </button>
          <button
            type="button"
            className="conversation-composer-reply-cancel"
            onClick={replyContext.onCancel}
            aria-label={t('conversations.cancelReply', 'Cancel reply')}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
      {pendingGif && (
        <div className="composer-gif-preview">
          <img
            src={pendingGif.tinyUrl}
            alt={pendingGif.searchTerm || 'GIF'}
            className="composer-gif-preview__img"
          />
          <span className="composer-gif-preview__label">
            {pendingGif.type === 'sticker' ? 'Sticker' : 'GIF'}
          </span>
          <button
            type="button"
            className="composer-gif-preview__remove"
            onClick={() => setPendingGif(null)}
            aria-label={t('gif.removePreview', 'Remove GIF')}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
      <ComposerAttachments
        attachments={attachments}
        onRemove={removeAttachment}
        stripExif={stripExif}
        onToggleExif={setStripExif}
        showExifToggle={attachments.some((a) => a.file.type.startsWith('image/'))}
        showMp4NoReencodeToggle={allVideosAreMp4}
        sendMp4WithoutReencode={sendMp4WithoutReencode}
        onToggleSendMp4WithoutReencode={setSendMp4WithoutReencode}
        moderationEnabled={moderationEnabled}
        onToggleModerationEnabled={setModerationEnabled}
        showModerationToggle={allowSkipModeration === true && attachments.length > 0}
      />
      <div
        className={`conversation-composer-row${isMultiLine ? ' conversation-composer-row--multiline' : ''}`}
        style={{
          '--composer-inset-left': `${fieldInsets.left}px`,
          '--composer-inset-right': `${fieldInsets.right}px`,
        } as React.CSSProperties}
      >
        <ComposerShortcodeAutocomplete
          suggestions={acSuggestions}
          selectedIdx={acSelectedIdx}
          onSelect={handleShortcodeSelect}
        />
        <ComposerMentionAutocomplete
          suggestions={mentionSuggestions}
          selectedIdx={mentionAcSelectedIdx}
          onSelect={acceptMention}
        />
        <ComposerPageTagAutocomplete
          suggestions={pageTagSuggestions}
          selectedIdx={pageTagAcSelectedIdx}
          onSelect={acceptPageTag}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <div className="conversation-composer-row__left" ref={leftControlsRef}>
          {leftControls.map((control) => renderComposerControl(control))}
        </div>
        <textarea
          ref={inputRef}
          id="message-composer"
          name="message-composer"
          className="conversation-composer-field"
          placeholder={placeholder}
          value={messageText}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={acSuggestions.length > 0 || mentionSuggestions.length > 0 || pageTagSuggestions.length > 0}
          aria-controls={
            mentionSuggestions.length > 0
              ? 'mention-ac-listbox'
              : pageTagSuggestions.length > 0
                ? 'pagetag-ac-listbox'
                : acSuggestions.length > 0
                  ? 'emoji-ac-listbox'
                  : undefined
          }
          aria-activedescendant={
            mentionSuggestions.length > 0
              ? `mention-ac-option-${mentionSuggestions[mentionAcSelectedIdx]?.id}`
              : pageTagSuggestions.length > 0
                ? `pagetag-ac-option-${pageTagSuggestions[pageTagAcSelectedIdx]?.id}`
                : acSuggestions.length > 0
                  ? `emoji-ac-option-${acSuggestionKey(acSuggestions[acSelectedIdx])}`
                  : undefined
          }
          onChange={(e) => {
            const raw = e.target.value;
            const oldText = messageTextRef.current;
            const converted = convertShortcodes(raw);
            if (converted !== raw) {
              const cursorPos = e.target.selectionStart ?? raw.length;
              const newCursorPos = Math.max(0, cursorPos - (raw.length - converted.length));
              handleUpdateMentionOffsets(oldText, converted, newCursorPos);
              setMessageText(converted, newCursorPos);
              handleShortcodeDetect(converted, newCursorPos);
              handleMentionDetect(converted, newCursorPos);
              handlePageTagDetect(converted, newCursorPos);
              requestAnimationFrame(() => {
                inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
              });
            } else {
              const cursorPos = e.target.selectionStart ?? raw.length;
              handleUpdateMentionOffsets(oldText, raw, cursorPos);
              setMessageText(raw, cursorPos);
              handleShortcodeDetect(raw, cursorPos);
              handleMentionDetect(raw, cursorPos);
              handlePageTagDetect(raw, cursorPos);
            }
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCopy={handleCopy}
          rows={1}
          readOnly={disabled}
          disabled={disabled || sending}
        />
        <div
          className="conversation-composer-row__right"
          ref={rightControlsRef}
          style={disabled ? { display: 'none' } : undefined}
        >
          {rightControls.map((control) => renderComposerControl(control))}
        </div>
      </div>
    </div>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content className="dm-context-menu">
            <Menu.Item value="copy" className="dm-context-menu-item" disabled={disabled || sending}>
              <Icon name="copy" className="dm-context-menu-item-icon" />
              {t('conversations.contextMenu.copy', 'Copy')}
            </Menu.Item>
            <Menu.Item value="copy-all" className="dm-context-menu-item" disabled={disabled || sending}>
              <Icon name="copyAll" className="dm-context-menu-item-icon" />
              {t('conversations.contextMenu.copyAll', 'Copy all')}
            </Menu.Item>
            <Menu.Item value="select-all" className="dm-context-menu-item" disabled={disabled || sending}>
              <Icon name="selectAll" className="dm-context-menu-item-icon" />
              {t('conversations.contextMenu.selectAll', 'Select all')}
            </Menu.Item>
            <Menu.Item value="paste" className="dm-context-menu-item" disabled={disabled || sending}>
              <Icon name="fileImport" className="dm-context-menu-item-icon" />
              {t('conversations.contextMenu.paste', 'Paste')}
            </Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
});

MessageComposer.displayName = 'MessageComposer';
