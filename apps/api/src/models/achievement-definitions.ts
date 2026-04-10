/**
 * Achievement definitions registry
 *
 * All achievements are defined here in code. The server uses these definitions
 * to determine trigger conditions and award achievements. Clients use the
 * public subset (id, name, description, icon, category) for display.
 *
 * Names and descriptions are i18n keys resolved on the client.
 */

export type AchievementCategory = 'social' | 'messaging' | 'security' | 'profile' | 'misc';

export type AchievementTrigger =
  | { type: 'action'; action: string }
  | { type: 'count'; action: string; threshold: number };

export interface AchievementDefinition {
  id: string;
  /** i18n key for the display name */
  name: string;
  /** i18n key for the description */
  description: string;
  /** Optional i18n key for more detailed "how to achieve" instructions */
  how?: string;
  /** Icon name from the UI icon registry */
  icon: string;
  category: AchievementCategory;
  trigger: AchievementTrigger;
}

/**
 * Public subset of an achievement definition (safe for clients).
 */
export interface PublicAchievementDefinition {
  id: string;
  name: string;
  description: string;
  how?: string;
  icon: string;
  category: AchievementCategory;
}

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  // -- Social --
  {
    id: 'first_friend',
    name: 'achievements.firstFriend.name',
    description: 'achievements.firstFriend.description',
    icon: 'userPlus',
    category: 'social',
    trigger: { type: 'count', action: 'friendship_created', threshold: 1 },
  },
  {
    id: 'five_friends',
    name: 'achievements.fiveFriends.name',
    description: 'achievements.fiveFriends.description',
    icon: 'users',
    category: 'social',
    trigger: { type: 'count', action: 'friendship_created', threshold: 5 },
  },
  {
    id: 'ten_friends',
    name: 'achievements.tenFriends.name',
    description: 'achievements.tenFriends.description',
    icon: 'users',
    category: 'social',
    trigger: { type: 'count', action: 'friendship_created', threshold: 10 },
  },

  // -- Messaging --
  {
    id: 'first_message',
    name: 'achievements.firstMessage.name',
    description: 'achievements.firstMessage.description',
    icon: 'message',
    category: 'messaging',
    trigger: { type: 'count', action: 'message_sent', threshold: 1 },
  },
  {
    id: 'hundred_messages',
    name: 'achievements.hundredMessages.name',
    description: 'achievements.hundredMessages.description',
    icon: 'message',
    category: 'messaging',
    trigger: { type: 'count', action: 'message_sent', threshold: 100 },
  },
  {
    id: 'first_group',
    name: 'achievements.firstGroup.name',
    description: 'achievements.firstGroup.description',
    icon: 'group',
    category: 'messaging',
    trigger: { type: 'action', action: 'group_created' },
  },

  // -- Social (blocking) --
  {
    id: 'block_someone',
    name: 'achievements.blockSomeone.name',
    description: 'achievements.blockSomeone.description',
    icon: 'ban',
    category: 'social',
    trigger: { type: 'action', action: 'user_blocked' },
  },
  {
    id: 'blocked_by_someone',
    name: 'achievements.blockedBySomeone.name',
    description: 'achievements.blockedBySomeone.description',
    icon: 'ban',
    category: 'social',
    trigger: { type: 'action', action: 'user_blocked_by' },
  },
  {
    id: 'mutual_block',
    name: 'achievements.mutualBlock.name',
    description: 'achievements.mutualBlock.description',
    icon: 'ban',
    category: 'social',
    trigger: { type: 'action', action: 'mutual_block' },
  },
  {
    id: 'block_unblock',
    name: 'achievements.blockUnblock.name',
    description: 'achievements.blockUnblock.description',
    icon: 'ban',
    category: 'social',
    trigger: { type: 'action', action: 'block_then_unblock' },
  },

  // -- Messaging --
  {
    id: 'delete_for_everyone',
    name: 'achievements.deleteForEveryone.name',
    description: 'achievements.deleteForEveryone.description',
    icon: 'trash',
    category: 'messaging',
    trigger: { type: 'action', action: 'message_deleted_for_all' },
  },
  {
    id: 'ttl_message_sent',
    name: 'achievements.ttlMessageSent.name',
    description: 'achievements.ttlMessageSent.description',
    icon: 'clock',
    category: 'messaging',
    trigger: { type: 'action', action: 'ttl_message_sent' },
  },

  // -- Security --
  {
    id: 'first_device_added',
    name: 'achievements.firstDeviceAdded.name',
    description: 'achievements.firstDeviceAdded.description',
    icon: 'device',
    category: 'security',
    trigger: { type: 'action', action: 'device_registered' },
  },
  {
    id: 'fs_message_sent',
    name: 'achievements.fsMessageSent.name',
    description: 'achievements.fsMessageSent.description',
    icon: 'lock',
    category: 'security',
    trigger: { type: 'action', action: 'fs_message_sent' },
  },
  {
    id: 'fs_default_enabled',
    name: 'achievements.fsDefaultEnabled.name',
    description: 'achievements.fsDefaultEnabled.description',
    icon: 'shield',
    category: 'security',
    trigger: { type: 'action', action: 'fs_default_enabled' },
  },
  {
    id: 'fs_ttl_message',
    name: 'achievements.fsTtlMessage.name',
    description: 'achievements.fsTtlMessage.description',
    icon: 'lock',
    category: 'security',
    trigger: { type: 'action', action: 'fs_ttl_message_sent' },
  },

  // -- Profile --
  {
    id: 'profile_customized',
    name: 'achievements.profileCustomized.name',
    description: 'achievements.profileCustomized.description',
    icon: 'palette',
    category: 'profile',
    trigger: { type: 'action', action: 'profile_customized' },
  },
  {
    id: 'banner_set',
    name: 'achievements.bannerSet.name',
    description: 'achievements.bannerSet.description',
    icon: 'image',
    category: 'profile',
    trigger: { type: 'action', action: 'banner_set' },
  },
  {
    id: 'theme_saved',
    name: 'achievements.themeSaved.name',
    description: 'achievements.themeSaved.description',
    icon: 'palette',
    category: 'profile',
    trigger: { type: 'action', action: 'theme_saved' },
  },

  // -- Misc --
  {
    id: 'first_reaction',
    name: 'achievements.firstReaction.name',
    description: 'achievements.firstReaction.description',
    icon: 'heart',
    category: 'misc',
    trigger: { type: 'count', action: 'reaction_added', threshold: 1 },
  },
  {
    id: 'notifications_disabled',
    name: 'achievements.notificationsDisabled.name',
    description: 'achievements.notificationsDisabled.description',
    icon: 'bell',
    category: 'misc',
    trigger: { type: 'action', action: 'notifications_disabled' },
  },
  {
    id: 'notification_max_volume',
    name: 'achievements.notificationMaxVolume.name',
    description: 'achievements.notificationMaxVolume.description',
    icon: 'bell',
    category: 'misc',
    trigger: { type: 'action', action: 'notification_volume_maxed' },
  },
  {
    id: 'show_message_artifacts',
    name: 'achievements.showMessageArtifacts.name',
    description: 'achievements.showMessageArtifacts.description',
    icon: 'eye',
    category: 'misc',
    trigger: { type: 'action', action: 'show_message_artifacts_enabled' },
  },
];

export const ACHIEVEMENT_MAP = new Map(
  ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d])
);

/**
 * Actions that may be claimed via the client-side claim endpoint.
 * Server-verified achievements (block, send message, etc.) are NOT claimable.
 */
export const CLAIMABLE_ACTIONS = new Set([
  'fs_default_enabled',
  'notifications_disabled',
  'notification_volume_maxed',
  'theme_saved',
  'show_message_artifacts_enabled',
]);

export function toPublicDefinition(def: AchievementDefinition): PublicAchievementDefinition {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    ...(def.how ? { how: def.how } : {}),
    icon: def.icon,
    category: def.category,
  };
}
