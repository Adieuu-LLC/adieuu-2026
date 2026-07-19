import { useState, useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Portal, Menu } from '@ark-ui/react';
import { convertShortcodes } from '../../utils/emojiShortcodes';
import {
  type MediaAttachment,
  type GifAttachment,
} from '../../services/messagePayload';
import { createApiClient, CONV_MEDIA_BASE_MAX_BYTES, type PublicCustomEmoji } from '@adieuu/shared';
import type { EmojiSelectResult } from '../EmojiPicker';
import type { ContentTab } from '../GifPicker';
import { useToast } from '../Toast';
import { useAppConfig } from '../../config';
import { useAuth } from '../../hooks/useAuth';
import { useIdentity } from '../../hooks/useIdentity';
import type {
  ComposerSendFn,
  ComposerReplyContext,
  MentionSource,
  PageTagSource,
} from './composerTypes';
import {
  resolveConversationComposerMediaMaxBytes,
  PLACEHOLDER_VERB_KEYS,
} from './composerTypes';
import { runGifSendNow } from './composerGifSendNow';
import { ComposerAttachments } from './ComposerAttachments';
import { ComposerBanners } from './ComposerBanners';
import { ComposerLeftRail, ComposerRightRail } from './ComposerControlRails';
import { ComposerShortcodeAutocomplete, ComposerMentionAutocomplete, ComposerPageTagAutocomplete } from './ComposerAutocomplete';
import { ComposerContextMenu } from './ComposerContextMenu';
import { useComposerAutoHeight } from './useComposerAutoHeight';
import { useComposerFieldInsets } from './useComposerFieldInsets';
import { useComposerUndoHistory } from './useComposerUndoHistory';
import { useComposerAttachments } from './useComposerAttachments';
import { useComposerAutocomplete, acSuggestionKey } from './useComposerAutocomplete';
import { useComposerEditHydration } from './useComposerEditHydration';
import { useComposerSend } from './useComposerSend';
import { useComposerPasteAndClipboard } from './useComposerPasteAndClipboard';
import { useMediaOutbox } from '../../services/mediaOutbox';
import {
  getComposerControlsBySide,
  useComposerControlsPreference,
} from '../../hooks/useComposerControlsPreference';

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
  editContext?: { messageId: string; clientMessageId?: string; onCancel: () => void } | null;
  /**
   * When this value changes, the input is replaced with `editingInitialPlaintext` (for edit mode).
   * Use a stable value like the message id or a monotonic key.
   */
  editingMessageKey?: string | null;
  /** Plain text (plus shortcodes) to load when entering edit mode. */
  editingInitialPlaintext?: string;
  /** Existing attachments from the message being edited (loaded into staging on edit entry). */
  editingInitialAttachments?: { media: MediaAttachment[]; gifs: GifAttachment[] };
  /** When true, conversation allows participants to skip moderation per-send. */
  allowSkipModeration?: boolean;
};

const MessageComposerInner = forwardRef<MessageComposerHandle, MessageComposerProps>(function MessageComposer(
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
  editingInitialAttachments,
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

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [lastMediaTab, setLastMediaTab] = useState<ContentTab>('gifs');
  const [pendingGif, setPendingGif] = useState<GifAttachment | null>(null);
  const [ttlSeconds, setTtlSeconds] = useState<number | undefined>(undefined);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const leftControlsRef = useRef<HTMLDivElement>(null);
  const rightControlsRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    messageText,
    setMessageText,
    messageTextRef,
    resetHistory,
    handleUndoRedoKeyDown,
  } = useComposerUndoHistory({ inputRef });

  const {
    attachments,
    setAttachments,
    stripExif,
    setStripExif,
    moderationEnabled,
    setModerationEnabled,
    sendMp4WithoutReencode,
    setSendMp4WithoutReencode,
    allVideosAreMp4,
    composerToast,
    showComposerToast,
    warnAttachmentTooLarge,
    commitMediaFilesToAttachments,
    handleFileSelect,
    removeAttachment,
    addMediaFiles,
  } = useComposerAttachments({
    t,
    toastWarning,
    conversationMediaMaxBytes,
    conversationMediaGatherOpts,
    fileInputRef,
    disabled,
    sending,
  });

  const {
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
    handleShortcodeSelect,
    handleAutocompleteKeyDown,
  } = useComposerAutocomplete({
    inputRef,
    messageTextRef,
    setMessageText,
    mentionSource,
    pageTagSource,
    customEmojis,
    customEmojisDisabled,
    mentionInsertRef,
  });

  useComposerEditHydration({
    editContext,
    editingMessageKey,
    editingInitialPlaintext,
    editingInitialAttachments,
    setMessageText,
    mentionEntriesRef,
    pageTagEntriesRef,
    setAttachments,
    setPendingGif,
    inputRef,
  });

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

  const isMultiLine = useComposerAutoHeight(inputRef, messageText);

  const klipyShare = useCallback(
    (params: { slug: string; type: GifAttachment['type']; searchTerm?: string }) => {
      api.klipy.share(params);
    },
    [api],
  );

  const handleSend = useComposerSend({
    disabled,
    channelId,
    sending,
    onSend,
    onSendSucceeded,
    forwardSecrecy,
    replyContext,
    editContext,
    editingInitialAttachments,
    ttlSeconds,
    mentionSource,
    customEmojis,
    customEmojisDisabled,
    attachments,
    pendingGif,
    stripExif,
    moderationEnabled,
    sendMp4WithoutReencode,
    allVideosAreMp4,
    enqueueMediaSend,
    klipyShare,
    toastError,
    t,
    messageTextRef,
    mentionEntriesRef,
    pageTagEntriesRef,
    inputRef,
    setMessageText,
    setPendingGif,
    setAttachments,
    setSendMp4WithoutReencode,
    resetHistory,
  });

  const {
    handlePaste,
    handleCopy,
    handleComposerContextMenu,
  } = useComposerPasteAndClipboard({
    disabled,
    inputRef,
    messageText,
    messageTextRef,
    setMessageText,
    handleUpdateMentionOffsets,
    handleShortcodeDetect,
    handleMentionDetect,
    handlePageTagDetect,
    showComposerToast,
    warnAttachmentTooLarge,
    commitMediaFilesToAttachments,
    conversationMediaGatherOpts,
    t,
    toastWarning,
    toastError,
  });

  useImperativeHandle(
    ref,
    () => ({ addMediaFiles }),
    [addMediaFiles],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (handleAutocompleteKeyDown(e)) return;

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

      if (handleUndoRedoKeyDown(e)) return;
    },
    [handleAutocompleteKeyDown, editContext, handleSend, handleUndoRedoKeyDown],
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
  }, [setMessageText, messageTextRef]);

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
  const canSendMessage = useMemo(
    () =>
      !!channelId &&
      !disabled &&
      !sending &&
      (!!messageText.trim() || attachments.length > 0 || !!pendingGif),
    [channelId, disabled, sending, messageText, attachments.length, pendingGif],
  );

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  const onAttachClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onSendClick = useCallback(() => {
    void handleSend();
  }, [handleSend]);

  const onMediaPickerOpenChange = useCallback((open: boolean) => {
    setShowMediaPicker(open);
  }, []);

  const onEmojiPickerOpenChange = useCallback((open: boolean) => {
    setShowEmojiPicker(open);
  }, []);

  const clearPendingGif = useCallback(() => {
    setPendingGif(null);
  }, []);

  const railShared = {
    sending,
    canSendMessage,
    forwardSecrecy,
    ttlSeconds,
    onSelectTtl: setTtlSeconds,
    attachmentCount: attachments.length,
    gifsDisabled,
    showMediaPicker,
    onMediaPickerOpenChange,
    lastMediaTab,
    onMediaTabChange: setLastMediaTab,
    onGifSelect: handleGifSelect,
    onGifSendNow: handleGifSendNow,
    lastMessageText: showMediaPicker ? lastMessageText : undefined,
    channelId,
    showEmojiPicker,
    onEmojiPickerOpenChange,
    onEmojiSelect: handleEmojiSelect,
    customEmojisDisabled,
    customEmojis,
    onSend: onSendClick,
    onAttachClick,
    focusInput,
  };

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
      <ComposerBanners
        editContext={editContext}
        replyContext={replyContext}
        pendingGif={pendingGif}
        onClearPendingGif={clearPendingGif}
        disabled={disabled || sending}
      />
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
        <ComposerLeftRail
          controls={leftControls}
          controlsRef={leftControlsRef}
          {...railShared}
        />
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
        <ComposerRightRail
          controls={rightControls}
          controlsRef={rightControlsRef}
          disabled={disabled}
          {...railShared}
        />
      </div>
    </div>
      </Menu.ContextTrigger>
      <Portal>
        <Menu.Positioner>
          <ComposerContextMenu disabled={disabled} sending={sending} />
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
});

MessageComposerInner.displayName = 'MessageComposer';

export const MessageComposer = memo(MessageComposerInner);
MessageComposer.displayName = 'MessageComposer';
