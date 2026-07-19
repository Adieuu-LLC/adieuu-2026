import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type MutableRefObject,
  type RefObject,
} from 'react';
import type { TFunction } from 'i18next';
import type { PendingAttachment } from './composerTypes';
import { MAX_ATTACHMENTS } from './composerTypes';
import {
  gatherConversationMediaFromFileList,
} from './conversationMediaFromClipboard';

export interface UseComposerAttachmentsParams {
  t: TFunction;
  toastWarning: (title: string, description?: string) => void;
  conversationMediaMaxBytes: number;
  conversationMediaGatherOpts: { maxBytes: number };
  fileInputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  sending: boolean;
}

export interface ComposerAttachments {
  attachments: PendingAttachment[];
  setAttachments: Dispatch<SetStateAction<PendingAttachment[]>>;
  attachmentsRef: MutableRefObject<PendingAttachment[]>;
  stripExif: boolean;
  setStripExif: Dispatch<SetStateAction<boolean>>;
  moderationEnabled: boolean;
  setModerationEnabled: Dispatch<SetStateAction<boolean>>;
  sendMp4WithoutReencode: boolean;
  setSendMp4WithoutReencode: Dispatch<SetStateAction<boolean>>;
  videoAttachments: PendingAttachment[];
  allVideosAreMp4: boolean;
  composerToast: string | null;
  showComposerToast: (label: string) => void;
  warnAttachmentTooLarge: () => void;
  commitMediaFilesToAttachments: (files: File[], options?: { toastLabel?: string }) => void;
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  removeAttachment: (index: number) => void;
  /** Imperative entry used by MessageComposer's ref handle. */
  addMediaFiles: (list: FileList | File[]) => void;
}

/**
 * Owns pending attachments state and the surrounding UI concerns: the mini-toast,
 * size warnings, EXIF/moderation/mp4 toggles, file selection, removal (with object
 * URL revocation), and the imperative addMediaFiles used by the composer ref handle.
 */
export function useComposerAttachments(params: UseComposerAttachmentsParams): ComposerAttachments {
  const {
    t,
    toastWarning,
    conversationMediaMaxBytes,
    conversationMediaGatherOpts,
    fileInputRef,
    disabled,
    sending,
  } = params;

  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [stripExif, setStripExif] = useState(true);
  const [moderationEnabled, setModerationEnabled] = useState(true);
  const [sendMp4WithoutReencode, setSendMp4WithoutReencode] = useState(false);

  const videoAttachments = useMemo(
    () => attachments.filter((a) => a.file.type.startsWith('video/')),
    [attachments]
  );
  const allVideosAreMp4 =
    videoAttachments.length > 0 && videoAttachments.every((a) => a.file.type === 'video/mp4');

  useEffect(() => {
    if (!allVideosAreMp4) setSendMp4WithoutReencode(false);
  }, [allVideosAreMp4]);

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
    [commitMediaFilesToAttachments, warnAttachmentTooLarge, t, conversationMediaGatherOpts, fileInputRef],
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

  const addMediaFiles = useCallback(
    (list: FileList | File[]) => {
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
    [disabled, sending, warnAttachmentTooLarge, commitMediaFilesToAttachments, t, conversationMediaGatherOpts],
  );

  return {
    attachments,
    setAttachments,
    attachmentsRef,
    stripExif,
    setStripExif,
    moderationEnabled,
    setModerationEnabled,
    sendMp4WithoutReencode,
    setSendMp4WithoutReencode,
    videoAttachments,
    allVideosAreMp4,
    composerToast,
    showComposerToast,
    warnAttachmentTooLarge,
    commitMediaFilesToAttachments,
    handleFileSelect,
    removeAttachment,
    addMediaFiles,
  };
}
