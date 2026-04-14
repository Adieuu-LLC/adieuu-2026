import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { Icon } from '../../icons/Icon';

export function ConversationToolbar({
  displayName,
  subtitle,
  pinsSlot,
  showSettings,
  onToggleSettings,
  showMembers,
  onToggleMembers,
  isGroup,
  canDeleteConversation,
  onDeleteGroup,
  onLeave,
}: {
  displayName: string;
  subtitle: string;
  /** Pinned messages popover control (toolbar icon). */
  pinsSlot?: ReactNode;
  showSettings: boolean;
  onToggleSettings: () => void;
  showMembers: boolean;
  onToggleMembers: () => void;
  isGroup: boolean;
  /** Group: admin only. Topical DM: either participant. */
  canDeleteConversation: boolean;
  onDeleteGroup: () => void;
  onLeave: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="conversation-toolbar">
      <div className="conversation-toolbar-left">
        <div className="conversation-toolbar-avatar">
          <span className="conversation-toolbar-avatar-placeholder">
            {displayName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="conversation-toolbar-info">
          <span className="conversation-toolbar-title">{displayName}</span>
          <span className="conversation-toolbar-subtitle">{subtitle}</span>
        </div>
      </div>
      <div className="conversation-toolbar-right">
        {pinsSlot}
        <Button
          variant="ghost"
          size="sm"
          className={`conversation-toolbar-btn${showSettings ? ' active' : ''}`}
          onClick={onToggleSettings}
        >
          <span className="conversation-toolbar-btn-icon" aria-hidden>
            <Icon name="settings" size="sm" />
          </span>
          {t('conversations.settings', 'Settings')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`conversation-toolbar-btn${showMembers ? ' active' : ''}`}
          onClick={onToggleMembers}
        >
          <span className="conversation-toolbar-btn-icon" aria-hidden>
            <Icon name="users" size="sm" />
          </span>
          {t('conversations.members', 'Members')}
        </Button>
        {canDeleteConversation && (
          <Button
            variant="ghost"
            size="sm"
            className="conversation-toolbar-btn conversation-toolbar-btn--danger"
            onClick={onDeleteGroup}
          >
            <span className="conversation-toolbar-btn-icon" aria-hidden>
              <Icon name="trash" size="sm" />
            </span>
            {isGroup
              ? t('conversations.deleteGroup', 'Delete Group')
              : t('conversations.deleteConversation', 'Delete conversation')}
          </Button>
        )}
        {isGroup && (
          <Button variant="ghost" size="sm" className="conversation-toolbar-btn" onClick={onLeave}>
            <span className="conversation-toolbar-btn-icon" aria-hidden>
              <Icon name="logout" size="sm" />
            </span>
            {t('conversations.leave', 'Leave')}
          </Button>
        )}
      </div>
    </div>
  );
}
