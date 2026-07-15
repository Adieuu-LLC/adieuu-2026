/**
 * Simple message list for Space channels.
 *
 * Renders messages in chronological order (oldest first). When a Community
 * Cipher is provided, encrypted `content` is decrypted locally before display.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicSpaceMessage } from '@adieuu/shared';
import {
  decryptWithCipher,
  deserializeCipherPayload,
  fromBytes,
  type CommunityCipher,
  type SerializedCipherPayload,
} from '@adieuu/crypto';
import { parsePayload } from '../../services/messagePayload';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

interface SpaceMessageListProps {
  messages: PublicSpaceMessage[];
  loading: boolean;
  hasOlderMessages: boolean;
  onLoadOlder: () => void;
  /** When provided, encrypted messages are decrypted locally. */
  cipher?: CommunityCipher | null;
}

export function SpaceMessageList({
  messages,
  loading,
  hasOlderMessages,
  onLoadOlder,
  cipher,
}: SpaceMessageListProps) {
  const { t } = useTranslation();

  const chronological = useMemo(() => [...messages].reverse(), [messages]);

  if (loading && messages.length === 0) {
    return (
      <div className="space-messages-loading">
        <Spinner size="md" />
      </div>
    );
  }

  if (!loading && messages.length === 0) {
    return (
      <div className="space-messages-empty">
        <p className="spaces-state-body">{t('spaces.channel.noMessages')}</p>
      </div>
    );
  }

  return (
    <div className="space-messages">
      {hasOlderMessages && (
        <div className="space-messages-load-older">
          <Button variant="ghost" size="sm" onClick={onLoadOlder} disabled={loading}>
            {loading ? <Spinner size="sm" /> : t('spaces.channel.loadOlder')}
          </Button>
        </div>
      )}
      {chronological.map((msg) => (
        <SpaceMessageRow key={msg.id} message={msg} cipher={cipher} />
      ))}
    </div>
  );
}

/**
 * Attempts to parse and decrypt a message's content. Returns the decrypted
 * plaintext on success, or `{ fallback: rawContent }` when decryption is not
 * possible (wrong cipher, malformed payload, etc.).
 */
function tryDecryptContent(
  content: string | undefined,
  cipher: CommunityCipher | null | undefined,
): { text: string; encrypted: boolean } {
  if (!content) return { text: '', encrypted: false };

  if (cipher) {
    try {
      const parsed = JSON.parse(content) as SerializedCipherPayload;
      if (parsed.ciphertext && parsed.nonce && parsed.cipherId) {
        const payload = deserializeCipherPayload(parsed);
        const decrypted = decryptWithCipher(cipher, payload);
        return { text: fromBytes(decrypted), encrypted: true };
      }
    } catch {
      // Not an encrypted payload — fall through to plaintext handling.
    }
  }

  // For non-E2EE channels (or if decryption failed), the content may still be
  // a conversation-style serialized JSON payload (with `version`, `text`,
  // `senderDeviceId`, etc.) from MessageComposer. Unwrap to just the text.
  const { text } = parsePayload(content);
  return { text, encrypted: false };
}

function SpaceMessageRow({
  message,
  cipher,
}: {
  message: PublicSpaceMessage;
  cipher?: CommunityCipher | null;
}) {
  const ts = useMemo(() => {
    const d = new Date(message.createdAt);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, [message.createdAt]);

  const { text } = useMemo(
    () => tryDecryptContent(message.content, cipher),
    [message.content, cipher],
  );

  return (
    <div className="space-message-row">
      <div className="space-message-avatar">
        <span className="space-message-avatar-placeholder">
          {message.fromIdentityId.slice(-2).toUpperCase()}
        </span>
      </div>
      <div className="space-message-content">
        <div className="space-message-header">
          <span className="space-message-author">
            {message.fromIdentityId.slice(-8)}
          </span>
          <time className="space-message-time" dateTime={message.createdAt}>
            {ts}
          </time>
        </div>
        <div className="space-message-text">{text}</div>
      </div>
    </div>
  );
}
