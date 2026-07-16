/**
 * Simple message list for Space channels.
 *
 * Renders messages in chronological order (oldest first). When a Community
 * Cipher is provided, encrypted `content` is decrypted locally before display.
 * Participant profiles are resolved asynchronously and displayed with
 * {@link IdentityHoverCard} for hover-to-preview behaviour matching
 * conversation messages.
 *
 * Reuses the shared {@link renderFormattedMessage} pipeline for markdown,
 * links, mentions, and custom emoji — the same renderer used by conversation
 * {@link MessageBubble}s.
 */

import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicIdentity, PublicSpaceMessage } from '@adieuu/shared';
import {
  decryptWithCipher,
  deserializeCipherPayload,
  fromBytes,
  type CommunityCipher,
  type SerializedCipherPayload,
} from '@adieuu/crypto';
import { parsePayload, type ParsedMessagePayload } from '../../services/messagePayload';
import {
  renderFormattedMessage,
  injectEntityMarkers,
  type MentionRenderContext,
} from '../../utils/markdownParser';
import {
  resolveDisplayName,
  formatMessageTime,
  formatAbsoluteTime,
} from '../conversations/conversationUtils';
import { extractDomain } from '../../utils/urlParsing';
import { isDomainTrusted } from '../../hooks/useExternalLinkPreferences';
import { IdentityHoverCard } from '../../components/IdentityHoverCard';
import { Tooltip } from '../../components/Tooltip';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

interface SpaceMessageListProps {
  messages: PublicSpaceMessage[];
  loading: boolean;
  hasOlderMessages: boolean;
  onLoadOlder: () => void;
  /** When provided, encrypted messages are decrypted locally. */
  cipher?: CommunityCipher | null;
  /** Resolved profiles keyed by identity ID. */
  participantProfiles?: Record<string, PublicIdentity>;
  selfId?: string;
}

export function SpaceMessageList({
  messages,
  loading,
  hasOlderMessages,
  onLoadOlder,
  cipher,
  participantProfiles,
  selfId,
}: SpaceMessageListProps) {
  const { t } = useTranslation();

  const chronological = useMemo(() => [...messages].reverse(), [messages]);

  const handleLinkClick = useCallback((href: string) => {
    const domain = extractDomain(href);
    if (domain && isDomainTrusted(domain)) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const mentionCtx: MentionRenderContext | undefined = useMemo(
    () =>
      participantProfiles
        ? { profiles: participantProfiles, memberSettings: {}, selfId }
        : undefined,
    [participantProfiles, selfId],
  );

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
        <SpaceMessageRow
          key={msg.id}
          message={msg}
          cipher={cipher}
          profile={participantProfiles?.[msg.fromIdentityId]}
          profiles={participantProfiles ?? {}}
          selfId={selfId}
          onLinkClick={handleLinkClick}
          mentionCtx={mentionCtx}
        />
      ))}
    </div>
  );
}

/**
 * Attempts to parse and decrypt a message's content. Returns the full parsed
 * payload (text, mentions, custom emoji, etc.) for rendering through the
 * shared markdown pipeline.
 */
function decryptAndParse(
  content: string | undefined,
  cipher: CommunityCipher | null | undefined,
): ParsedMessagePayload {
  const empty: ParsedMessagePayload = {
    text: '',
    attachments: [],
    mentions: [],
    pageTags: [],
    gifAttachments: [],
    customEmojis: {},
    isStructured: false,
  };

  if (!content) return empty;

  if (cipher) {
    try {
      const parsed = JSON.parse(content) as SerializedCipherPayload;
      if (parsed.ciphertext && parsed.nonce && parsed.cipherId) {
        const payload = deserializeCipherPayload(parsed);
        const decrypted = fromBytes(decryptWithCipher(cipher, payload));
        return parsePayload(decrypted);
      }
    } catch {
      // Not an encrypted payload — fall through to plaintext handling.
    }
  }

  return parsePayload(content);
}

interface SpaceMessageRowProps {
  message: PublicSpaceMessage;
  cipher?: CommunityCipher | null;
  profile?: PublicIdentity;
  profiles: Record<string, PublicIdentity>;
  selfId?: string;
  onLinkClick: (href: string) => void;
  mentionCtx?: MentionRenderContext;
}

function SpaceMessageRow({
  message,
  cipher,
  profile,
  profiles,
  selfId,
  onLinkClick,
  mentionCtx,
}: SpaceMessageRowProps) {
  const { t } = useTranslation();

  const parsed = useMemo(
    () => decryptAndParse(message.content, cipher),
    [message.content, cipher],
  );

  const displayName = resolveDisplayName(
    message.fromIdentityId,
    profiles,
    {},
    selfId,
    t as (key: string, fallback: string) => string,
  );

  const renderedContent = useMemo(() => {
    const markedText = injectEntityMarkers(
      parsed.text,
      parsed.mentions,
      parsed.pageTags,
    );
    return renderFormattedMessage(
      markedText,
      onLinkClick,
      mentionCtx,
      parsed.customEmojis,
    );
  }, [parsed, onLinkClick, mentionCtx]);

  const avatarContent = profile?.avatarUrl ? (
    <img src={profile.avatarUrl} alt="" className="space-message-avatar-img" />
  ) : (
    <span className="space-message-avatar-placeholder">
      {displayName.charAt(0).toUpperCase()}
    </span>
  );

  const avatarEl = profile ? (
    <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
      <button type="button" className="space-message-avatar-btn">
        {avatarContent}
      </button>
    </IdentityHoverCard>
  ) : (
    <div className="space-message-avatar">{avatarContent}</div>
  );

  const nameEl = profile ? (
    <IdentityHoverCard identity={profile} positioning={{ placement: 'right', gutter: 8 }}>
      <button type="button" className="space-message-author">
        {displayName}
      </button>
    </IdentityHoverCard>
  ) : (
    <span className="space-message-author">{displayName}</span>
  );

  return (
    <div className="space-message-row">
      {avatarEl}
      <div className="space-message-content">
        <div className="space-message-header">
          {nameEl}
          <Tooltip content={formatAbsoluteTime(message.createdAt)} position="top">
            <time className="space-message-time" dateTime={message.createdAt}>
              {formatMessageTime(message.createdAt)}
            </time>
          </Tooltip>
        </div>
        {renderedContent}
      </div>
    </div>
  );
}
