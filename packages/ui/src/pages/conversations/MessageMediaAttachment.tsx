import { memo } from 'react';
import type { MediaAttachment } from '../../services/messagePayload';
import { MediaMessage } from '../../components/MediaMessage';
import { useE2EMediaDownload } from '../../hooks/useE2EMediaDownload';

export const MessageMediaAttachment = memo(function MessageMediaAttachment({
  attachment,
}: {
  attachment: MediaAttachment;
}) {
  const { state, imageUrl, rejectionReason, errorMessage, retry } =
    useE2EMediaDownload(attachment);

  return (
    <MediaMessage
      attachment={attachment}
      state={state}
      imageUrl={imageUrl ?? undefined}
      rejectionReason={rejectionReason ?? undefined}
      errorMessage={errorMessage ?? undefined}
      onRetry={retry}
    />
  );
});
