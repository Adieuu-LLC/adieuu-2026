import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';

export function ConversationToolbar({
  displayName,
  subtitle,
  showSettings,
  onToggleSettings,
  showMembers,
  onToggleMembers,
  isGroup,
  isAdmin,
  onDeleteGroup,
  onLeave,
}: {
  displayName: string;
  subtitle: string;
  showSettings: boolean;
  onToggleSettings: () => void;
  showMembers: boolean;
  onToggleMembers: () => void;
  isGroup: boolean;
  isAdmin: boolean;
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
        <Button
          variant="ghost"
          size="sm"
          className={`conversation-toolbar-btn${showSettings ? ' active' : ''}`}
          onClick={onToggleSettings}
        >
          {t('conversations.settings', 'Settings')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`conversation-toolbar-btn${showMembers ? ' active' : ''}`}
          onClick={onToggleMembers}
        >
          {t('conversations.members', 'Members')}
        </Button>
        {isGroup && isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            className="conversation-toolbar-btn conversation-toolbar-btn--danger"
            onClick={onDeleteGroup}
          >
            {t('conversations.deleteGroup', 'Delete Group')}
          </Button>
        )}
        {isGroup && (
          <Button variant="ghost" size="sm" onClick={onLeave}>
            {t('conversations.leave', 'Leave')}
          </Button>
        )}
      </div>
    </div>
  );
}
