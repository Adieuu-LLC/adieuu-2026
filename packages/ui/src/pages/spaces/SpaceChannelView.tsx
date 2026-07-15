/**
 * Channel view inside a Space.
 *
 * Displays messages for a single text channel and wires up the shared
 * {@link MessageComposer} for sending. When the Space or channel has a
 * `cipherCheck`, messages are encrypted locally with the matching Community
 * Cipher before sending and decrypted on display.
 */

import { useCallback, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  encryptWithCipher,
  serializeCipherPayload,
  toBytes,
  type CommunityCipher,
} from '@adieuu/crypto';
import { useSpaces } from '../../hooks/useSpaces';
import { useCipherStore } from '../../hooks/useCipherStore';
import { getSpaceCipherLink } from '../../services/spaceCipherService';
import { parsePayload } from '../../services/messagePayload';
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

  const { getCipherKey } = useCipherStore();

  useEffect(() => {
    if (channelId) {
      setActiveChannel(channelId);
    }
    return () => {
      setActiveChannel(null);
    };
  }, [channelId, setActiveChannel]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === channelId) ?? null,
    [channels, channelId],
  );

  const isEncrypted = !!(activeSpace?.cipherCheck || activeChannel?.cipherCheck);

  const spaceCipher: CommunityCipher | null = useMemo(() => {
    if (!isEncrypted || !activeSpace) return null;
    const localCipherId = getSpaceCipherLink(activeSpace.id);
    if (!localCipherId) return null;
    return getCipherKey(localCipherId);
  }, [isEncrypted, activeSpace, getCipherKey]);

  const onSend: ComposerSendFn = useCallback(
    async (composerPayload: string) => {
      // MessageComposer outputs a serializePayload() result which may be JSON
      // (e.g. when senderDeviceId is set). Space channels store plain text
      // content, so we always unwrap to just the text.
      const { text } = parsePayload(composerPayload);
      if (!text) return;

      if (isEncrypted && spaceCipher) {
        const encrypted = encryptWithCipher(spaceCipher, toBytes(text));
        const serialized = serializeCipherPayload(encrypted);
        await sendMessage(JSON.stringify(serialized));
      } else {
        await sendMessage(text);
      }
    },
    [sendMessage, isEncrypted, spaceCipher],
  );

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
        {isEncrypted && (
          <span className="spaces-badge spaces-badge--encrypted spaces-badge--toolbar">
            {t('spaces.encrypted')}
          </span>
        )}
      </div>

      <div className="space-channel-body">
        <SpaceMessageList
          messages={activeMessages}
          loading={activeMessagesLoading}
          hasOlderMessages={!!activeMessagesOlderCursor}
          onLoadOlder={handleLoadOlder}
          cipher={spaceCipher}
        />
      </div>

      <div className="space-channel-composer">
        {isEncrypted && !spaceCipher ? (
          <div className="space-channel-no-cipher">
            <p className="spaces-state-body">
              {t('spaces.channel.noCipher')}
            </p>
          </div>
        ) : (
          <MessageComposer
            channelId={activeChannelId ?? channelId!}
            sending={sending}
            onSend={onSend}
          />
        )}
      </div>
    </div>
  );
}
