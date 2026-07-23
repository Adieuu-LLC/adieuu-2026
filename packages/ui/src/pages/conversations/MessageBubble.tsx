/**
 * Thin wrapper that converts a conversation {@link DisplayMessage} into
 * the shared {@link ChannelMessage} view model and delegates to
 * {@link ChannelMessageBubble}.
 *
 * All rendering logic now lives in `components/messaging/ChannelMessageBubble`.
 */
import { useMemo, memo } from 'react';
import type { DisplayMessage } from '../../hooks/useConversations';
import { displayMessageToChannel } from '../../components/messaging';
import {
  ChannelMessageBubble,
  type ChannelMessageBubbleProps,
} from '../../components/messaging/ChannelMessageBubble';

export { ReplyQuoteButton } from '../../components/messaging/ReplyQuoteButton';

type MessageBubbleProps = Omit<ChannelMessageBubbleProps, 'message'> & {
  message: DisplayMessage;
};

export const MessageBubble = memo(function MessageBubble({
  message,
  ...rest
}: MessageBubbleProps) {
  const channelMsg = useMemo(() => displayMessageToChannel(message), [message]);
  return <ChannelMessageBubble message={channelMsg} {...rest} />;
});
