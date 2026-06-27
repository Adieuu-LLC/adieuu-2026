import { useTranslation } from 'react-i18next';
import type { DecryptedConversation } from '../../hooks/useConversations';
import { formatConversationSinceDate } from '../../pages/conversations/conversationUtils';

/**
 * Message count and thread start date for sidebar conversation hover cards (DM + group).
 */
export function ConversationSidebarHoverMeta({ conversation }: { conversation: DecryptedConversation }) {
  const { t } = useTranslation();
  const isGroup = conversation.type === 'group';
  const messageLine =
    conversation.messageCount === undefined
      ? t('conversations.sidebarHoverMessagesLoading', '…')
      : t('conversations.sidebarHoverMessageCount', {
          count: conversation.messageCount,
          defaultValue: '{{count}} messages',
        });

  return (
    <div className="invite-group-hover-card-meta-block">
      <p className="invite-group-hover-card-meta-line">
        {isGroup
          ? t('conversations.sidebarHoverMetaBulletMessages', {
              left: t('conversations.invites.previewMemberCount', {
                count: conversation.participants.length,
                defaultValue: '{{count}} members',
              }),
              right: messageLine,
              defaultValue: '{{left}} • {{right}}',
            })
          : messageLine}
      </p>
      <p className="invite-group-hover-card-started">
        {t('conversations.sidebarHoverSince', {
          date: formatConversationSinceDate(conversation.createdAt),
          defaultValue: 'Since {{date}}',
        })}
      </p>
    </div>
  );
}
