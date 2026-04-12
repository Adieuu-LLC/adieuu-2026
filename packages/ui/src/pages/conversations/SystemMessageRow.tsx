import { useTranslation } from 'react-i18next';
import type { SystemEvent } from '@adieuu/shared';

export function SystemMessageRow({ event }: { event: SystemEvent }) {
  const { t } = useTranslation();
  const name = event.displayName ?? event.identityId.slice(0, 8);
  const actorName = event.actorDisplayName ?? event.actorIdentityId?.slice(0, 8);

  let text: string;
  switch (event.type) {
    case 'member_joined':
      text = t('conversations.systemMessage.memberJoined', {
        name,
        defaultValue: `${name} has joined the conversation`,
      });
      break;
    case 'member_invited': {
      const inviteeLabel = event.username
        ? `${name} (@${event.username})`
        : name;
      const actorDisplay =
        event.actorDisplayName ?? event.actorIdentityId?.slice(0, 8) ?? '';
      const actorLabel =
        actorDisplay && event.actorUsername
          ? `${actorDisplay} (@${event.actorUsername})`
          : actorDisplay;
      text = actorLabel
        ? t('conversations.systemMessage.memberInvitedLine', {
            invitee: inviteeLabel,
            actor: actorLabel,
            defaultValue: `${inviteeLabel} was invited by ${actorLabel}`,
          })
        : t('conversations.systemMessage.memberInvitedInviteeOnly', {
            invitee: inviteeLabel,
            defaultValue: `${inviteeLabel} was invited`,
          });
      break;
    }
    case 'member_left':
      text = t('conversations.systemMessage.memberLeft', {
        name,
        defaultValue: `${name} has left the conversation`,
      });
      break;
    case 'member_removed':
      text = actorName
        ? t('conversations.systemMessage.memberRemoved', {
            actor: actorName,
            name,
            defaultValue: `${actorName} removed ${name} from the group`,
          })
        : t('conversations.systemMessage.memberRemovedSimple', {
            name,
            defaultValue: `${name} was removed from the group`,
          });
      break;
    case 'admin_promoted':
      text = actorName
        ? t('conversations.systemMessage.adminPromoted', {
            actor: actorName,
            name,
            defaultValue: `${actorName} made ${name} an admin`,
          })
        : t('conversations.systemMessage.adminPromotedSimple', {
            name,
            defaultValue: `${name} is now an admin`,
          });
      break;
    case 'group_renamed':
      text = actorName
        ? t('conversations.systemMessage.groupRenamed', {
            actor: actorName,
            defaultValue: `${actorName} renamed the group`,
          })
        : t('conversations.systemMessage.groupRenamedSimple', {
            name,
            defaultValue: `${name} renamed the group`,
          });
      break;
    default:
      text = event.type;
  }

  return (
    <div className="dm-system-message">
      <span className="dm-system-message-text">{text}</span>
    </div>
  );
}
