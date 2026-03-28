import { useTranslation } from 'react-i18next';
import { useChatSocket } from '../hooks/useChatSocket';

/**
 * Thin banner shown when the WebSocket chat connection is not yet established
 * or is recovering. Gives visual confirmation that the client is actively
 * attempting to reach the chat service.
 */
export function ChatConnectionBanner() {
  const { connectionState } = useChatSocket();
  const { t } = useTranslation();

  if (connectionState !== 'connecting' && connectionState !== 'reconnecting') return null;

  const isReconnecting = connectionState === 'reconnecting';

  return (
    <div
      className={`chat-connection-banner${isReconnecting ? ' chat-connection-banner--warn' : ''}`}
      role="status"
    >
      <span className="spinner spinner-sm" />
      <span className="chat-connection-banner-text">
        {isReconnecting
          ? t('chat.reconnecting', 'Reconnecting to chat...')
          : t('chat.connecting', 'Connecting to chat...')}
      </span>
    </div>
  );
}
