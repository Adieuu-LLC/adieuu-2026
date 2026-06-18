import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { findIconDefinition } from '@fortawesome/fontawesome-svg-core';
import type { IconName, IconPrefix } from '@fortawesome/fontawesome-svg-core';
import type { ComposerSendIconId } from './composerTypes';
import { FALLBACK_PREFIX } from '../../icons/packs';

const SEND_ICON_FA_NAMES: Record<ComposerSendIconId, IconName> = {
  'paper-plane': 'paper-plane',
  mailbox: 'mailbox',
  'arrow-right': 'arrow-right',
  'message-arrow-up': 'message-arrow-up',
  'message-arrow-up-right': 'message-arrow-up-right',
};

export function ComposerSendIcon({
  icon,
  className,
}: {
  icon: ComposerSendIconId;
  className?: string;
}) {
  const iconName = SEND_ICON_FA_NAMES[icon];
  let def = findIconDefinition({ prefix: FALLBACK_PREFIX as IconPrefix, iconName });
  if (!def) {
    def = findIconDefinition({ prefix: 'fas' as IconPrefix, iconName });
  }
  if (!def) return null;
  return <FontAwesomeIcon icon={def} className={className} />;
}
