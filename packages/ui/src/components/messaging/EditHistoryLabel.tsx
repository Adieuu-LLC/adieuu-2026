import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, Portal } from '@ark-ui/react';
import { parsePayload } from '../../services/messagePayload';
import { formatAbsoluteTime } from '../../pages/conversations/conversationUtils';

export interface EditHistoryEntry {
  replacedAt: string;
  plaintext?: string;
  decryptionError?: string;
}

const POP_POSITIONING: Record<'header' | 'footer', { placement: 'bottom' | 'top'; gutter: number }> = {
  header: { placement: 'bottom', gutter: 6 },
  footer: { placement: 'top', gutter: 6 },
};

export interface EditHistoryLabelProps {
  lastEditedAt?: string;
  loadHistory: () => Promise<EditHistoryEntry[] | null>;
  className?: string;
  variant?: 'header' | 'footer';
}

/**
 * Generic "Edited" control with a popover showing prior message versions.
 * Source-agnostic: the caller provides `loadHistory` to fetch entries from
 * either the conversation or space API.
 */
export function EditHistoryLabel({ lastEditedAt, loadHistory, className, variant = 'header' }: EditHistoryLabelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<EditHistoryEntry[] | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const generationRef = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generationRef.current;
    setLoading(true);
    setFetchFailed(false);
    try {
      const data = await loadHistory();
      if (gen !== generationRef.current) return;
      if (data == null) {
        setFetchFailed(true);
        setEntries([]);
        return;
      }
      setEntries(data);
    } catch {
      if (gen !== generationRef.current) return;
      setFetchFailed(true);
      setEntries([]);
    } finally {
      if (gen === generationRef.current) {
        setLoading(false);
      }
    }
  }, [loadHistory]);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open);
        if (!e.open) {
          generationRef.current++;
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
            lastEditedAt
              ? formatAbsoluteTime(lastEditedAt)
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
            {open && (
              <>
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
              </>
            )}
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
