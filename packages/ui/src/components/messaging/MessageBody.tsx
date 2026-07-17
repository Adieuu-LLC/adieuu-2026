import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelMessage } from './channelMessage';
import type { UseMessageEmbedsResult } from './useMessageEmbeds';
import type { MediaMessageLayout } from '../MediaMessage';
import { Tooltip } from '../Tooltip';
import { MessageMediaAttachment } from '../../pages/conversations/MessageMediaAttachment';
import { MessageGifAttachment } from '../../pages/conversations/MessageGifAttachment';
import { MessageEmbeds } from '../embeds';
import { EnableEmbedsModal } from '../embeds/EnableEmbedsModal';

export interface MessageBodyProps {
  message: ChannelMessage;
  renderedContent: ReactNode;
  hasDecryptionError: boolean;
  decryptionLabel: string;
  decryptionDisplayText: string;
  mediaAttachmentLayout: MediaMessageLayout;
  gifsEnabled: boolean;
  gifAnimateOnHoverOnly: boolean;
  hideUnmoderatedMedia: boolean;
  embeds: UseMessageEmbedsResult;
}

export function MessageBody({
  message,
  renderedContent,
  hasDecryptionError,
  decryptionLabel,
  decryptionDisplayText,
  mediaAttachmentLayout,
  gifsEnabled,
  gifAnimateOnHoverOnly,
  hideUnmoderatedMedia,
  embeds,
}: MessageBodyProps) {
  const { t } = useTranslation();
  const content = message.body;

  if (message.deleted) {
    return (
      <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
        {t('conversations.messageDeleted', 'Message deleted')}
      </p>
    );
  }

  if (hasDecryptionError) {
    return (
      <Tooltip content={decryptionDisplayText} position="bottom">
        <p className="dm-message-text" style={{ fontStyle: 'italic', opacity: 0.6 }}>
          [{decryptionLabel}]
        </p>
      </Tooltip>
    );
  }

  return (
    <>
      {renderedContent}
      {message.attachments.length > 1 ? (
        <div className="dm-message-attachments">
          {message.attachments.map((att) => (
            <MessageMediaAttachment
              key={att.e2eMediaId}
              attachment={att}
              layout={mediaAttachmentLayout}
              hideUnmoderated={hideUnmoderatedMedia && message.moderationEnabled === false}
            />
          ))}
        </div>
      ) : (
        message.attachments.map((att) => (
          <MessageMediaAttachment
            key={att.e2eMediaId}
            attachment={att}
            layout={mediaAttachmentLayout}
            hideUnmoderated={hideUnmoderatedMedia && message.moderationEnabled === false}
          />
        ))
      )}
      {message.gifAttachments.map((gif, i) => (
        <MessageGifAttachment
          key={`gif-${i}`}
          gif={gif}
          gifsEnabled={gifsEnabled}
          gifAnimateOnHoverOnly={gifAnimateOnHoverOnly}
        />
      ))}
      {content && (embeds.embedPreference.mode !== 'none' || embeds.hasEmbedOverrides) && (
        <MessageEmbeds
          text={content}
          preference={embeds.embedPreference}
          fetchMetadata={embeds.fetchMetadata}
          overrides={embeds.embedOverrides}
          onAddToAllowlist={embeds.embedPreference.mode === 'allowlist' ? embeds.handleAddToAllowlist : undefined}
        />
      )}
      {content && embeds.hasHiddenEmbeds && (
        <div className="embed-hidden-actions">
          {(() => {
            const firstHidden = embeds.hiddenEmbedMap!.entries().next().value;
            if (!firstHidden) return null;
            const [, info] = firstHidden;
            return (
              <button
                type="button"
                className="embed-hidden-actions-show"
                onClick={() => info.onToggle()}
              >
                {t('conversations.embeds.showPreview', 'Show link preview')}
              </button>
            );
          })()}
          {embeds.showEmbedOnboarding && (
            <button
              type="button"
              className="embed-hidden-actions-enable-all"
              onClick={() => embeds.setEnableEmbedsModalOpen(true)}
            >
              {t('conversations.embeds.enableAllPrompt', 'Enable all embeds')}
            </button>
          )}
        </div>
      )}
      {embeds.enableEmbedsModalOpen && (
        <EnableEmbedsModal
          open={embeds.enableEmbedsModalOpen}
          onEnableAll={embeds.handleEnableAllEmbeds}
          onClose={() => {
            embeds.setEnableEmbedsModalOpen(false);
            embeds.dismissEmbedOnboarding();
          }}
        />
      )}
    </>
  );
}
