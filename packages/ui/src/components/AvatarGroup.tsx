/**
 * Avatar group component for displaying multiple avatars in a stacked layout.
 * Shows up to maxVisible avatars with an overflow indicator for additional members.
 */

import type { PublicIdentity } from '@adieuu/shared';
import { Avatar, type AvatarSize } from './Avatar';

export interface AvatarGroupProps {
  /** Array of identities to display avatars for */
  members: PublicIdentity[];
  /** Maximum number of avatars to show before overflow (default: 3) */
  maxVisible?: number;
  /** Size of each avatar */
  size?: AvatarSize;
  /** CSS class name */
  className?: string;
}

/**
 * Gets initials from a display name for avatar placeholder.
 */
function getInitials(displayName: string): string {
  return displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Displays a group of avatars in a stacked/overlapping layout.
 * When there are more members than maxVisible, shows a +n overflow indicator.
 */
export function AvatarGroup({
  members,
  maxVisible = 3,
  size = 'sm',
  className,
}: AvatarGroupProps) {
  const visibleMembers = members.slice(0, maxVisible);
  const overflowCount = members.length - maxVisible;

  return (
    <div className={`avatar-group ${className || ''}`}>
      {visibleMembers.map((member, index) => (
        <div
          key={member.id}
          className="avatar-group-item"
          style={{ zIndex: maxVisible - index }}
        >
          {member.avatarUrl ? (
            <img
              src={member.avatarUrl}
              alt={member.displayName}
              className="avatar-group-img"
            />
          ) : (
            <span className="avatar-group-placeholder">
              {getInitials(member.displayName)}
            </span>
          )}
        </div>
      ))}
      {overflowCount > 0 && (
        <div className="avatar-group-item avatar-group-overflow">
          <span className="avatar-group-overflow-text">+{overflowCount}</span>
        </div>
      )}
    </div>
  );
}
