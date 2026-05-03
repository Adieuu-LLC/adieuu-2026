import { useState, useRef, useLayoutEffect, useCallback, memo } from 'react';
import type { GroupedReaction } from '../../hooks/useReactions';
import type { ReactionCustomEmoji } from '../../services/reactionCryptoService';
import type { MemberSettingsMap } from '../../services/conversationCryptoService';
import type { PublicIdentity } from '@adieuu/shared';
import { Tooltip } from '../../components/Tooltip';
import { buildReactionTooltip } from './conversationUtils';

export const ReactionChip = memo(
  function ReactionChip({
    messageId,
    emoji,
    customEmoji,
    count,
    isOwn,
    ownReactionId,
    tooltipContent,
    onToggleReaction,
  }: {
    messageId: string;
    emoji: string;
    customEmoji?: ReactionCustomEmoji;
    count: number;
    isOwn: boolean;
    ownReactionId: string | undefined;
    tooltipContent: string;
    onToggleReaction: (
      messageId: string,
      emoji: string,
      ownReactionId?: string,
      customEmoji?: ReactionCustomEmoji,
    ) => void;
  }) {
    const prevCountRef = useRef<number | null>(null);
    const [countTick, setCountTick] = useState<'up' | 'down' | null>(null);

    const handleClick = useCallback(() => {
      onToggleReaction(messageId, emoji, ownReactionId, ownReactionId ? undefined : customEmoji);
    }, [messageId, emoji, ownReactionId, customEmoji, onToggleReaction]);

    useLayoutEffect(() => {
      const prev = prevCountRef.current;
      if (prev !== null && prev !== count) {
        setCountTick(count > prev ? 'up' : 'down');
        const id = window.setTimeout(() => setCountTick(null), 480);
        prevCountRef.current = count;
        return () => clearTimeout(id);
      }
      prevCountRef.current = count;
    }, [count]);

    const chipClass =
      `message-reaction-chip${isOwn ? ' message-reaction-chip--own' : ''}` +
      (countTick === 'up' ? ' message-reaction-chip--count-tick-up' : '') +
      (countTick === 'down' ? ' message-reaction-chip--count-tick-down' : '');

    const countClass =
      'message-reaction-chip-count' +
      (countTick === 'up' ? ' message-reaction-chip-count--tick-up' : '') +
      (countTick === 'down' ? ' message-reaction-chip-count--tick-down' : '');

    return (
      <Tooltip content={tooltipContent} position="top">
        <button type="button" className={chipClass} onClick={handleClick}>
          <span className="message-reaction-chip-emoji">
            {customEmoji ? (
              <img
                src={customEmoji.url}
                alt={customEmoji.name}
                className="message-reaction-chip-custom-emoji"
                width={18}
                height={18}
                loading="lazy"
              />
            ) : (
              emoji
            )}
          </span>
          <span className={countClass}>{count}</span>
        </button>
      </Tooltip>
    );
  },
  (prev, next) =>
    prev.messageId === next.messageId &&
    prev.emoji === next.emoji &&
    prev.count === next.count &&
    prev.isOwn === next.isOwn &&
    prev.ownReactionId === next.ownReactionId &&
    prev.tooltipContent === next.tooltipContent &&
    prev.customEmoji?.id === next.customEmoji?.id &&
    prev.onToggleReaction === next.onToggleReaction
);

export const ReactionBar = memo(function ReactionBar({
  messageId,
  reactions,
  onToggleReaction,
  participantProfiles,
  memberSettings,
  currentIdentityId,
}: {
  messageId: string;
  reactions: GroupedReaction[];
  onToggleReaction: (
    messageId: string,
    emoji: string,
    ownReactionId?: string,
    customEmoji?: ReactionCustomEmoji,
  ) => void;
  participantProfiles: Record<string, PublicIdentity>;
  memberSettings: MemberSettingsMap;
  currentIdentityId: string | undefined;
}) {
  if (reactions.length === 0) return null;

  return (
    <div className="message-reaction-bar">
      {reactions.map((r) => (
        <ReactionChip
          key={`${messageId}:${r.customEmoji ? `custom:${r.customEmoji.id}` : r.emoji}`}
          messageId={messageId}
          emoji={r.emoji}
          customEmoji={r.customEmoji}
          count={r.count}
          isOwn={r.isOwn}
          ownReactionId={r.ownReactionId}
          tooltipContent={buildReactionTooltip(r, participantProfiles, memberSettings, currentIdentityId)}
          onToggleReaction={onToggleReaction}
        />
      ))}
    </div>
  );
}, (prev, next) => {
  if (prev.messageId !== next.messageId) return false;
  if (prev.currentIdentityId !== next.currentIdentityId) return false;
  if (prev.participantProfiles !== next.participantProfiles) return false;
  if (prev.memberSettings !== next.memberSettings) return false;
  const pr = prev.reactions;
  const nr = next.reactions;
  if (pr.length !== nr.length) return false;
  for (let i = 0; i < pr.length; i++) {
    if (
      pr[i]!.emoji !== nr[i]!.emoji ||
      pr[i]!.count !== nr[i]!.count ||
      pr[i]!.isOwn !== nr[i]!.isOwn ||
      pr[i]!.ownReactionId !== nr[i]!.ownReactionId ||
      pr[i]!.customEmoji?.id !== nr[i]!.customEmoji?.id
    ) {
      return false;
    }
  }
  return true;
});
