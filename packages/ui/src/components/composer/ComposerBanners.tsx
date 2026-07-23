import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../icons/Icon';
import type { ComposerReplyContext } from './composerTypes';
import type { GifAttachment } from '../../services/messagePayload';

export const ComposerBanners = memo(function ComposerBanners({
  editContext,
  replyContext,
  pendingGif,
  onClearPendingGif,
  disabled,
}: {
  editContext?: { messageId: string; onCancel: () => void } | null;
  replyContext?: ComposerReplyContext | null;
  pendingGif: GifAttachment | null;
  onClearPendingGif: () => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <>
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
          {replyContext.onClick ? (
            <button
              type="button"
              className="conversation-composer-reply-text"
              title={`${replyContext.authorName}: ${replyContext.snippet}`}
              onClick={replyContext.onClick}
            >
              {replyContext.authorName}: {replyContext.snippet}
            </button>
          ) : (
            <span
              className="conversation-composer-reply-text"
              title={`${replyContext.authorName}: ${replyContext.snippet}`}
            >
              {replyContext.authorName}: {replyContext.snippet}
            </span>
          )}
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
            onClick={onClearPendingGif}
            aria-label={t('gif.removePreview', 'Remove GIF')}
            disabled={disabled}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </>
  );
});
