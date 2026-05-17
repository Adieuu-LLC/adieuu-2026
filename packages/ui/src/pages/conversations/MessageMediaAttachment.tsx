import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MediaAttachment } from '../../services/messagePayload';
import { MediaMessage, type MediaMessageLayout } from '../../components/MediaMessage';
import { FileAttachmentBubble } from '../../components/FileAttachmentBubble';
import { useE2EMediaDownload } from '../../hooks/useE2EMediaDownload';
import { isVisualMediaContentType } from '../../utils/fileAttachmentUtils';

export const MessageMediaAttachment = memo(function MessageMediaAttachment({
  attachment,
  layout = 'default',
  hideUnmoderated = false,
}: {
  attachment: MediaAttachment;
  layout?: MediaMessageLayout;
  /** When true, display a placeholder instead of downloading/rendering. */
  hideUnmoderated?: boolean;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const isVisual = isVisualMediaContentType(attachment.contentType);

  const shouldHide = hideUnmoderated && !revealed;

  const { state, imageUrl, rejectionReason, errorMessage, retry } =
    useE2EMediaDownload(attachment, { skip: shouldHide || !isVisual });

  if (!isVisual) {
    return <FileAttachmentBubble attachment={attachment} />;
  }

  if (shouldHide) {
    return (
      <div className="media-unmoderated-fallback">
        <span className="media-unmoderated-fallback__label">
          {t('conversations.unmoderatedMediaHidden', 'Content skipped moderation')}
        </span>
        <button
          type="button"
          className="media-unmoderated-fallback__reveal"
          onClick={() => setRevealed(true)}
        >
          {t('conversations.showUnmoderatedMedia', 'Show anyway')}
        </button>
      </div>
    );
  }

  return (
    <MediaMessage
      attachment={attachment}
      state={state}
      layout={layout}
      imageUrl={imageUrl ?? undefined}
      rejectionReason={rejectionReason ?? undefined}
      errorMessage={errorMessage ?? undefined}
      onRetry={retry}
    />
  );
});
