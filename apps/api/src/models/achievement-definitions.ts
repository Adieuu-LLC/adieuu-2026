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

  // -- Security --
  {
    id: 'e2e_setup',
    name: 'achievements.e2eSetup.name',
    description: 'achievements.e2eSetup.description',
    icon: 'lock',
    category: 'security',
    trigger: { type: 'action', action: 'e2e_initialized' },
  },
  {
    id: 'first_device_added',
    name: 'achievements.firstDeviceAdded.name',
    description: 'achievements.firstDeviceAdded.description',
    icon: 'device',
    category: 'security',
    trigger: { type: 'action', action: 'device_registered' },
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

  // -- Misc --
  {
    id: 'first_reaction',
    name: 'achievements.firstReaction.name',
    description: 'achievements.firstReaction.description',
    icon: 'heart',
    category: 'misc',
    trigger: { type: 'count', action: 'reaction_added', threshold: 1 },
  },
];

export const ACHIEVEMENT_MAP = new Map(
  ACHIEVEMENT_DEFINITIONS.map((d) => [d.id, d])
);

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
