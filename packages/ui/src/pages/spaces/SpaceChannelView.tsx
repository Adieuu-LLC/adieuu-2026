/**
 * Channel view inside a Space.
 *
 * Displays messages for a single text channel and wires up the shared
 * {@link MessageComposer} for plaintext sending. When the Space or channel has
 * a `cipherCheck`, E2EE messaging is not yet supported — a "coming soon" card
 * is shown instead of the composer.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSpaces } from '../../hooks/useSpaces';
import { Card } from '../../components/Card';
import { Spinner } from '../../components/Spinner';
import { MessageComposer } from '../../components/composer/MessageComposer';
import type { ComposerSendFn } from '../../components/composer/composerTypes';
import { SpaceMessageList } from './SpaceMessageList';

export function SpaceChannelView() {
  const { t } = useTranslation();
  const { channelId } = useParams<{ channelId: string }>();
  const {
    activeSpace,
    channels,
    activeChannelId,
    activeMessages,
    activeMessagesLoading,
    activeMessagesOlderCursor,
    sending,
    setActiveChannel,
    sendMessage,
    loadOlderMessages,
  } = useSpaces();

  const prevChannelRef = useRef<string | null>(null);

  useEffect(() => {
    if (!channelId) return;
    if (channelId !== prevChannelRef.current) {
      prevChannelRef.current = channelId;
      setActiveChannel(channelId);
    }
  }, [channelId, setActiveChannel]);

  useEffect(() => {
    return () => {
      setActiveChannel(null);
    };
  }, [setActiveChannel]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === channelId) ?? null,
    [channels, channelId],
  );

  const isEncrypted = !!(activeSpace?.cipherCheck || activeChannel?.cipherCheck);

  const onSend: ComposerSendFn = useCallback(
    async (plaintext: string) => {
      await sendMessage(plaintext);
    },
    [sendMessage],
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleLoadOlder = useCallback(() => {
    void loadOlderMessages();
  }, [loadOlderMessages]);

  if (!activeChannel) {
    return (
      <div className="space-channel-loading">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-channel-view">
      <div className="space-channel-toolbar">
        <span className="space-channel-toolbar-hash">#</span>
        <span className="space-channel-toolbar-name">{activeChannel.name}</span>
      </div>

      <div className="space-channel-body" ref={scrollContainerRef}>
        <SpaceMessageList
          messages={activeMessages}
          loading={activeMessagesLoading}
          hasOlderMessages={!!activeMessagesOlderCursor}
          onLoadOlder={handleLoadOlder}
        />
      </div>

      {isEncrypted ? (
        <Card variant="elevated" className="space-channel-e2ee-placeholder">
          <p className="spaces-state-body">
            {t('spaces.channel.e2eeComingSoon')}
          </p>
        </Card>
      ) : (
        <div className="space-channel-composer">
          <MessageComposer
            channelId={activeChannelId ?? channelId!}
            sending={sending}
            onSend={onSend}
          />
        </div>
      )}
    </div>
  );
}
