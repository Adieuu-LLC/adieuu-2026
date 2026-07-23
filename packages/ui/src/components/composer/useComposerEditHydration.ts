import { useEffect, useRef, type Dispatch, type SetStateAction, type MutableRefObject, type RefObject } from 'react';
import type { MediaAttachment, GifAttachment } from '../../services/messagePayload';
import type { PendingAttachment, TrackedMention, TrackedPageTag } from './composerTypes';

export interface UseComposerEditHydrationParams {
  editContext?: { messageId: string; clientMessageId?: string; onCancel: () => void } | null;
  editingMessageKey?: string | null;
  editingInitialPlaintext?: string;
  editingInitialAttachments?: { media: MediaAttachment[]; gifs: GifAttachment[] };
  setMessageText: (next: string, cursor?: number) => void;
  mentionEntriesRef: MutableRefObject<TrackedMention[]>;
  pageTagEntriesRef: MutableRefObject<TrackedPageTag[]>;
  setAttachments: Dispatch<SetStateAction<PendingAttachment[]>>;
  setPendingGif: Dispatch<SetStateAction<GifAttachment | null>>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
}

/**
 * Seeds composer text, attachments and gif when entering "edit message" mode, and
 * clears them when leaving. Keyed on `editingMessageKey` so re-hydration only runs
 * once per message. Preserves the original inline effect behavior exactly.
 */
export function useComposerEditHydration(params: UseComposerEditHydrationParams): void {
  const {
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
  } = params;

  const prevEditKey = useRef<string | null>(null);
  useEffect(() => {
    if (editContext && editingMessageKey) {
      if (prevEditKey.current !== editingMessageKey) {
        setMessageText(editingInitialPlaintext ?? '', (editingInitialPlaintext ?? '').length);
        mentionEntriesRef.current = [];
        pageTagEntriesRef.current = [];
        prevEditKey.current = editingMessageKey;

        if (editingInitialAttachments) {
          const existingAtts: PendingAttachment[] = editingInitialAttachments.media.map((att) => ({
            file: new File([], att.fileName ?? 'attachment', { type: att.contentType }),
            previewUrl: '',
            uploadStatus: 'done' as const,
            uploadProgress: 100,
            existingMediaId: att.e2eMediaId,
          }));
          setAttachments(existingAtts);
          if (editingInitialAttachments.gifs?.length) {
            setPendingGif(editingInitialAttachments.gifs[0] ?? null);
          }
        } else {
          setAttachments([]);
          setPendingGif(null);
        }

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
      pageTagEntriesRef.current = [];
      setAttachments((prev) => {
        for (const a of prev) {
          if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
        }
        return [];
      });
      prevEditKey.current = null;
    }
  }, [editContext, editingMessageKey, editingInitialPlaintext, editingInitialAttachments, setMessageText, mentionEntriesRef, pageTagEntriesRef, setAttachments, setPendingGif, inputRef]);
}
