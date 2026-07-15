/**
 * Simple message list for Space channels.
 *
 * Renders messages in chronological order (oldest first). A richer version
 * (reusing more shared components like `MessageBubble`) can replace this once
 * identity profiles, reactions, and richer payloads land.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicSpaceMessage } from '@adieuu/shared';
import { Button } from '../../components/Button';
import { Spinner } from '../../components/Spinner';

interface SpaceMessageListProps {
  messages: PublicSpaceMessage[];
  loading: boolean;
  hasOlderMessages: boolean;
  onLoadOlder: () => void;
}

export function SpaceMessageList({
  messages,
  loading,
  hasOlderMessages,
  onLoadOlder,
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
        <SpaceMessageRow key={msg.id} message={msg} />
      ))}
    </div>
  );
}

function SpaceMessageRow({ message }: { message: PublicSpaceMessage }) {
  const ts = useMemo(() => {
    const d = new Date(message.createdAt);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }, [message.createdAt]);

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
        <div className="space-message-text">{message.content}</div>
      </div>
    </div>
  );
}
