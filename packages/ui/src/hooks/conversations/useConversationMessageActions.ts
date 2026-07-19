import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../../components/Toast';
import { parsePayload } from '../../services/messagePayload';
import type { DisplayMessage } from '../useConversations';

/**
 * Message-level interaction state and handlers: reply/edit targeting, the
 * flashing highlight, report modal, and delete/pin/unpin actions, plus the
 * derived initial content used when editing a message.
 */
export function useConversationMessageActions(params: {
  conversationId: string | undefined;
  deleteMessage: (id: string, messageId: string, forEveryone: boolean) => void;
  pinMessage: (id: string, messageId: string) => Promise<boolean>;
  unpinMessage: (id: string, messageId: string) => Promise<boolean>;
}) {
  const { conversationId, deleteMessage, pinMessage, unpinMessage } = params;
  const { t } = useTranslation();
  const toast = useToast();

  const [replyingTo, setReplyingTo] = useState<DisplayMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<DisplayMessage | null>(null);
  const [flashingMessageId, setFlashingMessageId] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTargetMessageId, setReportTargetMessageId] = useState<string | undefined>();

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setFlashingMessageId(null);
    setReportModalOpen(false);
  }, [conversationId]);

  const handleDeleteMessage = useCallback(
    (messageId: string, forEveryone: boolean) => {
      if (!conversationId) return;
      deleteMessage(conversationId, messageId, forEveryone);
    },
    [conversationId, deleteMessage],
  );

  const handlePinMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      const ok = await pinMessage(conversationId, messageId);
      if (!ok) toast.error(t('conversations.pinFailed', 'Could not pin message'));
    },
    [conversationId, pinMessage, toast, t],
  );

  const handleUnpinMessage = useCallback(
    async (messageId: string) => {
      if (!conversationId) return;
      const ok = await unpinMessage(conversationId, messageId);
      if (!ok) toast.error(t('conversations.unpinFailed', 'Could not unpin message'));
    },
    [conversationId, unpinMessage, toast, t],
  );

  const handleReportMessage = useCallback((messageId: string) => {
    setReportTargetMessageId(messageId);
    setReportModalOpen(true);
  }, []);

  const handleStartEdit = useCallback((msg: DisplayMessage) => {
    setReplyingTo(null);
    setEditingMessage(msg);
  }, []);

  const onEditMaxReached = useCallback(() => {
    toast.error(t('conversations.messageEditMax'));
  }, [t, toast]);

  const editingInitialPlaintext = useMemo(() => {
    if (!editingMessage?.decryptedContent) return '';
    return parsePayload(editingMessage.decryptedContent).text;
  }, [editingMessage]);

  const editingInitialAttachments = useMemo(() => {
    if (!editingMessage?.decryptedContent) return undefined;
    const parsed = parsePayload(editingMessage.decryptedContent);
    if (parsed.attachments.length === 0 && parsed.gifAttachments.length === 0) return undefined;
    return { media: parsed.attachments, gifs: parsed.gifAttachments };
  }, [editingMessage]);

  return {
    replyingTo,
    setReplyingTo,
    editingMessage,
    setEditingMessage,
    flashingMessageId,
    setFlashingMessageId,
    reportModalOpen,
    setReportModalOpen,
    reportTargetMessageId,
    handleDeleteMessage,
    handlePinMessage,
    handleUnpinMessage,
    handleReportMessage,
    handleStartEdit,
    onEditMaxReached,
    editingInitialPlaintext,
    editingInitialAttachments,
  };
}
