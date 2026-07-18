import { useCallback, useEffect, useState, type DragEvent, type RefObject } from 'react';
import type { MessageComposerHandle } from '../../components/composer';

/**
 * Drag-and-drop file attachment handling for the conversation main panel.
 * All handlers no-op while the composer is disabled, and the active state
 * resets when switching conversations.
 */
export function useConversationFileDrop(params: {
  conversationId: string | undefined;
  composerInteractionDisabled: boolean;
  composerRef: RefObject<MessageComposerHandle | null>;
}) {
  const { conversationId, composerInteractionDisabled, composerRef } = params;
  const [conversationDropActive, setConversationDropActive] = useState(false);

  useEffect(() => {
    setConversationDropActive(false);
  }, [conversationId]);

  const handleConversationDragEnter = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      setConversationDropActive(true);
    },
    [composerInteractionDisabled],
  );

  const handleConversationDragLeave = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      const related = e.relatedTarget as Node | null;
      if (related && (e.currentTarget as HTMLElement).contains(related)) return;
      setConversationDropActive(false);
    },
    [composerInteractionDisabled],
  );

  const handleConversationDragOver = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [composerInteractionDisabled],
  );

  const handleConversationDrop = useCallback(
    (e: DragEvent) => {
      if (composerInteractionDisabled) return;
      e.preventDefault();
      setConversationDropActive(false);
      const { files } = e.dataTransfer;
      if (files?.length) {
        composerRef.current?.addMediaFiles(files);
      }
    },
    [composerInteractionDisabled, composerRef],
  );

  return {
    conversationDropActive,
    handleConversationDragEnter,
    handleConversationDragLeave,
    handleConversationDragOver,
    handleConversationDrop,
  };
}
