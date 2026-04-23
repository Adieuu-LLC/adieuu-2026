import { memo } from 'react';
import type { MediaAttachment } from '../../services/messagePayload';
import { MediaMessage, type MediaMessageLayout } from '../../components/MediaMessage';
import { useE2EMediaDownload } from '../../hooks/useE2EMediaDownload';

export const MessageMediaAttachment = memo(function MessageMediaAttachment({
  attachment,
  layout = 'default',
}: {
  attachment: MediaAttachment;
  layout?: MediaMessageLayout;
}) {
  const { state, imageUrl, rejectionReason, errorMessage, retry } =
    useE2EMediaDownload(attachment);

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
