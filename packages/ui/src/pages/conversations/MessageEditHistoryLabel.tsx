import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Portal } from '@ark-ui/react';
import type { DisplayMessage, MessageEditHistoryEntry } from '../../hooks/useConversations';
import { useConversations } from '../../hooks/useConversations';
import { parsePayload } from '../../services/messagePayload';
import { formatAbsoluteTime } from './conversationUtils';

const POP_POSITIONING: Record<'header' | 'footer', { placement: 'bottom' | 'top'; gutter: number }> = {
  header: { placement: 'bottom', gutter: 6 },
  footer: { placement: 'top', gutter: 6 },
};

type Props = {
  message: DisplayMessage;
  className?: string;
  /** `footer` insets the popover above the control (default bubble message row). */
  variant?: 'header' | 'footer';
};

/**
 * Renders a compact "Edited" control that opens a popover with prior E2E plaintext versions.
 */
export function MessageEditHistoryLabel({ message, className, variant = 'header' }: Props) {
  const { t } = useTranslation();
  const { loadMessageEditHistory } = useConversations();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<MessageEditHistoryEntry[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);

  const load = useCallback(async () => {
    if (!message.conversationId) return;
    setLoading(true);
    setFetchFailed(false);
    try {
      const data = await loadMessageEditHistory(message.conversationId, message);
      if (data == null) {
        setFetchFailed(true);
        setEntries([]);
        return;
      }
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [loadMessageEditHistory, message]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open);
        if (!e.open) {
          setEntries(null);
          setFetchFailed(false);
          setLoading(false);
        } else {
          void load();
        }
      }}
      positioning={POP_POSITIONING[variant]}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className={className}
          onClick={(ev) => ev.stopPropagation()}
          title={
            message.lastEditedAt
              ? formatAbsoluteTime(message.lastEditedAt)
              : t('conversations.viewEditHistory')
          }
        >
          {t('conversations.messageEdited')}
        </button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <Popover.Content
            className="message-edit-history-popover"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="message-edit-history-popover__title">
              {t('conversations.editHistoryTitle')}
            </div>
            {loading && (
              <p className="message-edit-history-popover__status" role="status">
                {t('conversations.editHistoryLoading')}
              </p>
            )}
            {!loading && fetchFailed && (
              <p className="message-edit-history-popover__error">
                {t('conversations.loadEditHistoryFailed')}
              </p>
            )}
            {!loading && !fetchFailed && entries && entries.length === 0 && (
              <p className="message-edit-history-popover__empty">
                {t('conversations.editHistoryEmpty')}
              </p>
            )}
            {!loading && !fetchFailed && entries && entries.length > 0 && (
              <ol className="message-edit-history-popover__list">
                {entries.map((e, i) => (
                  <li key={`${e.replacedAt}-${i}`} className="message-edit-history-popover__item">
                    <div className="message-edit-history-popover__meta" title={formatAbsoluteTime(e.replacedAt)}>
                      <span className="message-edit-history-popover__version">
                        {t('conversations.editHistoryVersion', { n: i + 1 })}
                      </span>
                      <span className="message-edit-history-popover__time">
                        {formatAbsoluteTime(e.replacedAt)}
                      </span>
                    </div>
                    {e.decryptionError || !e.plaintext ? (
                      <p className="message-edit-history-popover__unable">
                        {e.decryptionError
                          ? t('conversations.editHistoryUnableDecrypt')
                          : t('conversations.editHistoryNoPlaintext')}
                      </p>
                    ) : (
                      <p className="message-edit-history-popover__text">
                        {parsePayload(e.plaintext).text || t('conversations.editHistoryNoText')}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
