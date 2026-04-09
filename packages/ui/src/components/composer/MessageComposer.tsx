import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Portal } from '@ark-ui/react';
import { convertShortcodes, SHORTCODE_ENTRIES } from '../../utils/emojiShortcodes';
import { serializePayload, mediaPayload, gifPayload, type MediaAttachment, type MentionEntity, type GifAttachment } from '../../services/messagePayload';
import { uploadMediaFile, type MediaUploadResult } from '../../hooks/useConversationMediaUpload';
import { stripExifMetadata } from '../../utils/imageProcessing';
import { encrypt as encryptBytes, randomBytes, toBase64 } from '@adieuu/crypto';
import { createApiClient } from '@adieuu/shared';
import { EmojiPicker } from '../EmojiPicker';
import { GifPicker } from '../GifPicker';
import { Tooltip } from '../Tooltip';
import { useToast } from '../Toast';
import { Icon } from '../../icons/Icon';
import { useAppConfig } from '../../config';
import type {
  ComposerSendFn,
  ComposerReplyContext,
  MentionSource,
  PendingAttachment,
  TrackedMention,
} from './composerTypes';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  PLACEHOLDER_VERB_KEYS,
} from './composerTypes';
import { detectShortcodeQuery, detectMentionQuery, updateMentionOffsets } from './composerUtils';
import { ComposerAttachments } from './ComposerAttachments';
import { ComposerShortcodeAutocomplete, ComposerMentionAutocomplete } from './ComposerAutocomplete';
import { ComposerTTLMenu } from './ComposerTTLMenu';

export function MessageComposer({
  channelId,
  sending,
  onSend,
  forwardSecrecy,
  replyContext,
  onSendSucceeded,
  mentionSource,
  placeholder: placeholderOverride,
  placeholderTarget,
  mentionInsertRef,
}: {
  channelId: string;
  sending: boolean;
  onSend: ComposerSendFn;
  forwardSecrecy?: { enabled: boolean; onToggle: () => void };
  replyContext?: ComposerReplyContext | null;
  onSendSucceeded?: () => void;
  mentionSource?: MentionSource;
  placeholder?: string;
  placeholderTarget?: string;
  mentionInsertRef?: React.MutableRefObject<((identityId: string) => void) | null>;
}) {
  const { t } = useTranslation();
  const { warning: toastWarning, error: toastError } = useToast();
  const { apiBaseUrl } = useAppConfig();
  const api = useMemo(() => createApiClient({ baseUrl: apiBaseUrl }), [apiBaseUrl]);

  const placeholder = useMemo(() => {
    if (placeholderOverride) return placeholderOverride;
    if (!placeholderTarget) return t('conversations.messagePlaceholder', 'Type a message...');
    const key = PLACEHOLDER_VERB_KEYS[Math.floor(Math.random() * PLACEHOLDER_VERB_KEYS.length)]!;
    const verb = t(`conversations.placeholderVerbs.${key}` as const);
    return `${verb} ${placeholderTarget}...`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, placeholderTarget, placeholderOverride, t]);

  const [messageText, setMessageTextRaw] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pendingGif, setPendingGif] = useState<GifAttachment | null>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [stripExif, setStripExif] = useState(true);
  const [ttlSeconds, setTtlSeconds] = useState<number | undefined>(undefined);
  const [shortcodeAC, setShortcodeAC] = useState<{ query: string; colonIdx: number } | null>(null);
  const [acSelectedIdx, setAcSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageTextRef = useRef(messageText);
  messageTextRef.current = messageText;

  const acSuggestions = useMemo(() => {
    if (!shortcodeAC) return [];
    const q = shortcodeAC.query.toLowerCase();
    const prefix: [string, string][] = [];
    const substring: [string, string][] = [];
    for (const [code, emoji] of SHORTCODE_ENTRIES) {
      if (code.startsWith(q)) prefix.push([code, emoji]);
      else if (code.includes(q)) substring.push([code, emoji]);
    }
    return [...prefix, ...substring].slice(0, 3);
  }, [shortcodeAC]);

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

  const mentionSuggestions = useMemo(() => {
    if (!mentionAC || !mentionSource) return [];
    const q = mentionAC.query.toLowerCase();
    const prefix: { id: string; user: typeof mentionSource.users[number]; displayText: string }[] = [];
    const substring: typeof prefix = [];
    for (const user of mentionSource.users) {
      const uname = user.username?.toLowerCase() ?? '';
      const dname = user.displayName.toLowerCase();
      const displayText = mentionSource.resolveMentionDisplay(user.id);
      const fields = [uname, dname].filter(Boolean);
      if (fields.some((f) => f.startsWith(q))) prefix.push({ id: user.id, user, displayText });
      else if (fields.some((f) => f.includes(q))) substring.push({ id: user.id, user, displayText });
    }
    return [...prefix, ...substring].slice(0, 3);
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
  }, []);

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

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    let oversized = false;
    const newAttachments: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) continue;
      if (file.size > MAX_ATTACHMENT_BYTES) {
        oversized = true;
        continue;
      }
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENTS) break;
      newAttachments.push({ file, previewUrl: URL.createObjectURL(file), uploadStatus: 'pending', uploadProgress: 0 });
    }

    if (oversized) {
      const maxMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
      toastWarning(
        t('conversations.fileTooLarge', 'File too large'),
        t('conversations.fileTooLargeDesc', 'Attachments must be under {{maxMb}} MB.', { maxMb })
      );
    }

    setAttachments((prev) => [...prev, ...newAttachments].slice(0, MAX_ATTACHMENTS));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [attachments.length, toastWarning, t]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => {
      const next = [...prev];
      const removed = next.splice(index, 1);
      removed.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return next;
    });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    return () => {
      attachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
  }, []);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [channelId]);

  useEffect(() => {
    if (!sending) {
      inputRef.current?.focus();
    }
  }, [sending]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [replyContext]);

  const [isMultiLine, setIsMultiLine] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const scrollH = el.scrollHeight;
    el.style.height = `${scrollH}px`;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const verticalPadding = parseFloat(getComputedStyle(el).paddingTop) + parseFloat(getComputedStyle(el).paddingBottom);
    const multi = scrollH > lineHeight + verticalPadding + 2;
    setIsMultiLine(multi);
    el.style.overflowY = scrollH >= 500 ? 'auto' : 'hidden';
  }, [messageText]);

  const updateAttachmentStatus = useCallback((index: number, patch: Partial<PendingAttachment>) => {
    setAttachments((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }, []);

  const handleSend = useCallback(async () => {
    const text = messageTextRef.current.trim();
    if (!channelId || (!text && attachments.length === 0 && !pendingGif) || sending || uploadingMedia) return;

    const currentPendingGif = pendingGif;
    const pendingAttachments = [...attachments];
    const currentMentions = [...mentionEntriesRef.current];
    setMessageText('');
    setPendingGif(null);
    mentionEntriesRef.current = [];
    undoStack.current = [{ text: '', cursor: 0 }];
    redoStack.current = [];

    if (currentPendingGif) {
      const convertedText = convertShortcodes(text) || undefined;
      const payload = gifPayload(convertedText, currentPendingGif);
      const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      if (mentions.length > 0) payload.mentions = mentions;
      const plaintext = serializePayload(payload);

      const mentionedIdentityIds = mentions.length > 0
        ? [...new Set(mentions.map((m) => m.id))]
        : undefined;

      api.klipy.share({
        slug: currentPendingGif.slug,
        type: currentPendingGif.type,
        searchTerm: currentPendingGif.searchTerm || undefined,
      });

      const sent = await onSend(plaintext, {
        useForwardSecrecy: forwardSecrecy?.enabled,
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
      setUploadingMedia(true);

      interface UploadedMedia extends MediaUploadResult {
        encryptionKey: string;
        encryptionNonce: string;
      }

      let uploadedMedia: UploadedMedia[];

      try {
        const settled = await Promise.allSettled(
          pendingAttachments.map(async (att, i) => {
            updateAttachmentStatus(i, { uploadStatus: 'encrypting', uploadProgress: 5 });

            const fileToEncrypt = stripExif ? await stripExifMetadata(att.file) : att.file;
            const fileBytes = new Uint8Array(await fileToEncrypt.arrayBuffer());
            const mediaKey = randomBytes(32);
            const { ciphertext, nonce } = encryptBytes(mediaKey, fileBytes);
            const encryptedBlob = new Blob([ciphertext.buffer as ArrayBuffer], { type: 'application/octet-stream' });

            updateAttachmentStatus(i, { uploadStatus: 'uploading', uploadProgress: 15 });

            const result = await uploadMediaFile(api, att.file, encryptedBlob, { stripExif });

            updateAttachmentStatus(i, { uploadStatus: 'done', uploadProgress: 100 });

            return {
              ...result,
              encryptionKey: toBase64(mediaKey),
              encryptionNonce: toBase64(nonce),
            };
          }),
        );

        const results: UploadedMedia[] = [];
        let firstError: string | undefined;

        for (let i = 0; i < settled.length; i++) {
          const s = settled[i]!;
          if (s.status === 'fulfilled') {
            results.push(s.value);
          } else {
            const errorMsg = s.reason instanceof Error
              ? s.reason.message
              : t('conversations.uploadFailed', 'Upload failed');
            updateAttachmentStatus(i, { uploadStatus: 'error', uploadError: errorMsg });
            firstError ??= errorMsg;
          }
        }

        if (firstError) {
          toastError(t('conversations.uploadFailed', 'Upload failed'), firstError);
          setUploadingMedia(false);
          return;
        }

        uploadedMedia = results;
      } catch (err) {
        console.error('[Composer] Media upload failed:', err);
        toastError(
          t('conversations.uploadFailed', 'Upload failed'),
          err instanceof Error ? err.message : t('conversations.uploadFailedDesc', 'One or more attachments could not be uploaded.')
        );
        setUploadingMedia(false);
        return;
      }

      setUploadingMedia(false);

      const mediaAttachments: MediaAttachment[] = uploadedMedia.map((m) => ({
        e2eMediaId: m.e2eMediaId,
        scanHash: m.scanHash,
        contentType: m.contentType,
        fileName: m.fileName,
        width: m.width,
        height: m.height,
        sizeBytes: m.sizeBytes,
        exifPreserved: m.exifPreserved,
        encryptionKey: m.encryptionKey,
        encryptionNonce: m.encryptionNonce,
      }));

      const mediaText = convertShortcodes(text) || undefined;
      const payload = mediaPayload(mediaText, mediaAttachments);
      if (currentMentions.length > 0) payload.mentions = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      const plaintext = serializePayload(payload);
      const e2eMediaIds = uploadedMedia.map((m) => m.e2eMediaId);

      const mentionedIdentityIds = currentMentions.length > 0
        ? [...new Set(currentMentions.map((m) => m.identityId))]
        : undefined;

      const sent = await onSend(plaintext, {
        useForwardSecrecy: forwardSecrecy?.enabled,
        ...(replyContext ? { replyToMessageId: replyContext.messageId } : {}),
        ...(ttlSeconds ? { expiresInSeconds: ttlSeconds } : {}),
        e2eMediaIds,
        mentionedIdentityIds,
      });

      replyContext?.onCancel();
      setAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
        return [];
      });
      if (sent != null) {
        onSendSucceeded?.();
      }
      inputRef.current?.focus();
    } else {
      const convertedText = convertShortcodes(text);
      const mentions: MentionEntity[] = currentMentions.map((m) => ({ id: m.identityId, offset: m.offset, length: m.length }));
      const mentionedIdentityIds = mentions.length > 0
        ? [...new Set(mentions.map((m) => m.id))]
        : undefined;
      const plaintext = mentions.length > 0
        ? serializePayload({ version: 1, text: convertedText, mentions })
        : convertedText;
      const sent = await onSend(plaintext, {
        useForwardSecrecy: forwardSecrecy?.enabled,
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
  }, [channelId, sending, uploadingMedia, onSend, forwardSecrecy, replyContext, onSendSucceeded, attachments, pendingGif, stripExif, api, updateAttachmentStatus, toastError, t, ttlSeconds]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let oversized = false;
      const imageFiles: File[] = [];
      let hasTextData = false;
      for (const item of Array.from(items)) {
        if (item.type === 'text/plain') hasTextData = true;
        if (!item.type.startsWith('image/') || !ACCEPTED_IMAGE_TYPES.includes(item.type)) continue;
        const file = item.getAsFile();
        if (!file) continue;
        if (file.size > MAX_ATTACHMENT_BYTES) {
          oversized = true;
          continue;
        }
        imageFiles.push(file);
      }

      if (imageFiles.length === 0 && !oversized) {
        if (hasTextData) showComposerToast(t('conversations.pasted', 'Pasted'));
        return;
      }

      e.preventDefault();

      if (oversized) {
        const maxMb = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
        toastWarning(
          t('conversations.fileTooLarge', 'File too large'),
          t('conversations.fileTooLargeDesc', 'Attachments must be under {{maxMb}} MB.', { maxMb })
        );
      }

      if (imageFiles.length === 0) return;

      showComposerToast(t('conversations.pasted', 'Pasted'));

      setAttachments((prev) => {
        const remaining = MAX_ATTACHMENTS - prev.length;
        if (remaining <= 0) return prev;
        const toAdd = imageFiles.slice(0, remaining).map((file) => {
          const ext = file.type.split('/')[1] ?? 'png';
          const named = new File(
            [file],
            file.name && file.name !== 'image.png'
              ? file.name
              : `pasted-${Date.now()}.${ext}`,
            { type: file.type }
          );
          return { file: named, previewUrl: URL.createObjectURL(named), uploadStatus: 'pending' as const, uploadProgress: 0 };
        });
        return [...prev, ...toAdd];
      });
    },
    [toastWarning, t, showComposerToast]
  );

  const handleCopy = useCallback(() => {
    showComposerToast(t('conversations.copied', 'Copied'));
  }, [showComposerToast, t]);

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

      const ac = shortcodeACRef.current;
      const suggestions = acSuggestionsRef.current;
      if (ac && suggestions.length > 0) {
        if (e.key === 'Tab') {
          e.preventDefault();
          const [, emoji] = suggestions[acSelectedIdxRef.current]!;
          const textarea = inputRef.current!;
          const text = messageTextRef.current;
          const cursor = textarea.selectionStart ?? text.length;
          const newText = text.slice(0, ac.colonIdx) + emoji + text.slice(cursor);
          const newPos = ac.colonIdx + emoji.length;
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
    [handleSend, setMessageText, acceptMention]
  );

  const handleGifSelect = useCallback((gif: GifAttachment) => {
    setPendingGif(gif);
    setShowGifPicker(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => {
    const textarea = inputRef.current;
    if (!textarea) {
      setMessageText(messageTextRef.current + emoji);
      return;
    }
    const current = messageTextRef.current;
    const start = textarea.selectionStart ?? current.length;
    const end = textarea.selectionEnd ?? current.length;
    const newPos = start + emoji.length;
    setMessageText(current.slice(0, start) + emoji + current.slice(end), newPos);
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

  return (
    <div className="conversation-composer">
      {composerToast && (
        <div className="conversation-composer-mini-toast" role="status" aria-live="polite">
          {composerToast}
        </div>
      )}
      {replyContext && (
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
      />
      <div className={`conversation-composer-row${isMultiLine ? ' conversation-composer-row--multiline' : ''}`}>
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
        {forwardSecrecy && (
          <Tooltip
            content={forwardSecrecy.enabled
              ? t('conversations.fsEnabled', 'Forward secrecy is on for this message')
              : t('conversations.fsDisabled', 'Forward secrecy is off for this message')
            }
            position="top"
          >
            <button
              type="button"
              className={`conversation-fs-toggle${forwardSecrecy.enabled ? ' conversation-fs-toggle--active' : ''}`}
              onClick={() => { forwardSecrecy.onToggle(); requestAnimationFrame(() => inputRef.current?.focus()); }}
            >
              FS
            </button>
          </Tooltip>
        )}
        <Tooltip
          content={t('conversations.attachMedia', 'Attach image')}
          position="top"
        >
          <button
            type="button"
            className="conversation-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || uploadingMedia || attachments.length >= MAX_ATTACHMENTS}
          >
            <Icon name="image" />
          </button>
        </Tooltip>
        <Popover.Root
          open={showGifPicker}
          onOpenChange={(e) => setShowGifPicker(e.open)}
          positioning={{ placement: 'top-end' }}
        >
          <Popover.Trigger asChild>
            <Tooltip
              content={t('gif.composerButton', 'GIF')}
              position="top"
            >
              <button
                type="button"
                className="conversation-gif-btn"
                disabled={sending || uploadingMedia}
              >
                <span className="conversation-gif-btn__label">GIF</span>
              </button>
            </Tooltip>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content className="gif-picker-popover">
                <GifPicker onGifSelect={handleGifSelect} />
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
        <ComposerTTLMenu
          ttlSeconds={ttlSeconds}
          onSelect={setTtlSeconds}
          onAfterSelect={() => requestAnimationFrame(() => inputRef.current?.focus())}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          multiple
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        <textarea
          ref={inputRef}
          className="conversation-composer-field"
          placeholder={placeholder}
          value={messageText}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={acSuggestions.length > 0 || mentionSuggestions.length > 0}
          aria-controls={
            mentionSuggestions.length > 0
              ? 'mention-ac-listbox'
              : acSuggestions.length > 0
                ? 'emoji-ac-listbox'
                : undefined
          }
          aria-activedescendant={
            mentionSuggestions.length > 0
              ? `mention-ac-option-${mentionSuggestions[mentionAcSelectedIdx]?.id}`
              : acSuggestions.length > 0
                ? `emoji-ac-option-${acSuggestions[acSelectedIdx]![0]}`
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
              requestAnimationFrame(() => {
                inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
              });
            } else {
              const cursorPos = e.target.selectionStart ?? raw.length;
              handleUpdateMentionOffsets(oldText, raw, cursorPos);
              setMessageText(raw, cursorPos);
              handleShortcodeDetect(raw, cursorPos);
              handleMentionDetect(raw, cursorPos);
            }
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCopy={handleCopy}
          rows={1}
          disabled={sending || uploadingMedia}
        />
        <Popover.Root
          open={showEmojiPicker}
          onOpenChange={(e) => setShowEmojiPicker(e.open)}
          positioning={{ placement: 'top-end' }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              className="message-composer-emoji-btn"
              title={t('conversations.emojiButton', 'Emoji')}
            >
              <Icon name="smile" className="message-composer-emoji-icon" />
            </button>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <Popover.Content className="emoji-picker-popover">
                <EmojiPicker onEmojiSelect={handleEmojiSelect} />
              </Popover.Content>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
