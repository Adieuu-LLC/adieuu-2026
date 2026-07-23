import { useCallback, type MutableRefObject, type RefObject } from 'react';
import type { TFunction } from 'i18next';
import { copyPlainTextToClipboard, readPlainTextFromClipboard } from '../../utils/contextMenuClipboard';
import {
  gatherConversationMediaFromDataTransfer,
  readClipboardMediaFilesViaApi,
  shouldInterceptPasteForMediaInspection,
  clipboardPasteSuggestsNonPlainMedia,
} from './conversationMediaFromClipboard';

export interface UseComposerPasteAndClipboardParams {
  disabled?: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  messageText: string;
  messageTextRef: MutableRefObject<string>;
  setMessageText: (next: string, cursor?: number) => void;
  handleUpdateMentionOffsets: (oldText: string, newText: string, cursorPos: number) => void;
  handleShortcodeDetect: (text: string, cursorPos: number) => void;
  handleMentionDetect: (text: string, cursorPos: number) => void;
  handlePageTagDetect: (text: string, cursorPos: number) => void;
  showComposerToast: (label: string) => void;
  warnAttachmentTooLarge: () => void;
  commitMediaFilesToAttachments: (files: File[], options?: { toastLabel?: string }) => void;
  conversationMediaGatherOpts: { maxBytes: number };
  t: TFunction;
  toastWarning: (title: string, description?: string) => void;
  toastError: (title: string, description?: string) => void;
}

export interface ComposerPasteAndClipboard {
  insertPlainTextAtCaret: (inserted: string) => void;
  handlePaste: (e: React.ClipboardEvent) => void;
  handleCopy: () => void;
  handleComposerContextMenu: (details: { value: string | null }) => Promise<void>;
}

/**
 * Clipboard-related composer behavior: caret-aware plain text insertion, the
 * media-aware paste handler, the copy mini-toast, and the right-click context
 * menu actions (copy / copy-all / select-all / paste). Preserves behavior exactly.
 */
export function useComposerPasteAndClipboard(
  params: UseComposerPasteAndClipboardParams,
): ComposerPasteAndClipboard {
  const {
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
  } = params;

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
    [disabled, handleMentionDetect, handlePageTagDetect, handleShortcodeDetect, setMessageText, handleUpdateMentionOffsets, inputRef, messageTextRef],
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
      inputRef,
      messageTextRef,
    ],
  );

  return {
    insertPlainTextAtCaret,
    handlePaste,
    handleCopy,
    handleComposerContextMenu,
  };
}
