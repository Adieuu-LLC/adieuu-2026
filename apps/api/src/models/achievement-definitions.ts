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
  | { type: 'count'; action: string; threshold: number }
  | { type: 'entitlement'; entitlement: string };

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
    id: 'besties',
    name: 'achievements.besties.name',
    description: 'achievements.besties.description',
    icon: 'heart',
    category: 'messaging',
    trigger: { type: 'count', action: 'message_sent', threshold: 50 },
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

  // -- Profile (privacy / colours) --
  {
    id: 'get_off_my_lawn',
    name: 'achievements.getOffMyLawn.name',
    description: 'achievements.getOffMyLawn.description',
    icon: 'lock',
    category: 'profile',
    trigger: { type: 'action', action: 'privacy_all_private' },
  },
  {
    id: 'i_was_never_here',
    name: 'achievements.iWasNeverHere.name',
    description: 'achievements.iWasNeverHere.description',
    icon: 'mask',
    category: 'profile',
    trigger: { type: 'action', action: 'last_active_private' },
  },
  {
    id: 'polarizing',
    name: 'achievements.polarizing.name',
    description: 'achievements.polarizing.description',
    icon: 'palette',
    category: 'profile',
    trigger: { type: 'action', action: 'profile_colors_high_contrast' },
  },

  // -- Social --
  {
    id: 'we_dont_talk_anymore',
    name: 'achievements.weDontTalkAnymore.name',
    description: 'achievements.weDontTalkAnymore.description',
    icon: 'userMinus',
    category: 'social',
    trigger: { type: 'action', action: 'friend_removed' },
  },

  {
    id: 'mutual_report',
    name: 'achievements.mutualReport.name',
    description: 'achievements.mutualReport.description',
    icon: 'warning',
    category: 'social',
    trigger: { type: 'action', action: 'mutual_report' },
  },

  // -- Social (client-tracked) --
  {
    id: 'stalker',
    name: 'achievements.stalker.name',
    description: 'achievements.stalker.description',
    icon: 'eye',
    category: 'social',
    trigger: { type: 'action', action: 'profile_views_25' },
  },

  // -- Messaging (client-detected, hidden descriptions) --
  {
    id: 'answer_to_universe',
    name: 'achievements.answerToUniverse.name',
    description: 'achievements.answerToUniverse.description',
    icon: 'globe',
    category: 'messaging',
    trigger: { type: 'action', action: 'message_contains_42' },
  },
  {
    id: 'blaze_it',
    name: 'achievements.blazeIt.name',
    description: 'achievements.blazeIt.description',
    icon: 'fire',
    category: 'messaging',
    trigger: { type: 'action', action: 'message_contains_420' },
  },
  {
    id: 'nsfw',
    name: 'achievements.nsfw.name',
    description: 'achievements.nsfw.description',
    icon: 'warning',
    category: 'messaging',
    trigger: { type: 'action', action: 'curse_word_message_sent' },
  },
  {
    id: 'sailor',
    name: 'achievements.sailor.name',
    description: 'achievements.sailor.description',
    icon: 'message',
    category: 'messaging',
    trigger: { type: 'action', action: 'curse_word_messages_25' },
  },
  {
    id: 'how_is_prangent_formed',
    name: 'achievements.howIsPrangentFormed.name',
    description: 'achievements.howIsPrangentFormed.description',
    icon: 'personPregnant',
    category: 'messaging',
    trigger: { type: 'action', action: 'prangent_message_sent' },
  },
  {
    id: 'priceless',
    name: 'achievements.priceless.name',
    description: 'achievements.priceless.description',
    icon: 'creditCard',
    category: 'messaging',
    trigger: { type: 'action', action: 'priceless_message_sent' },
  },
  {
    id: 'corporate_jargon_bingo',
    name: 'achievements.corporateJargonBingo.name',
    description: 'achievements.corporateJargonBingo.description',
    icon: 'users',
    category: 'messaging',
    trigger: { type: 'action', action: 'synergy_message_sent' },
  },
  {
    id: 'door_closing_sound',
    name: 'achievements.doorClosingSound.name',
    description: 'achievements.doorClosingSound.description',
    icon: 'clock',
    category: 'messaging',
    trigger: { type: 'action', action: 'brb_message_sent' },
  },
  {
    id: 'writing_a_message',
    name: 'achievements.writingAMessage.name',
    description: 'achievements.writingAMessage.description',
    icon: 'desktop',
    category: 'messaging',
    trigger: { type: 'action', action: 'clippy_message_sent' },
  },
  {
    id: 'entering_chat_room',
    name: 'achievements.enteringChatRoom.name',
    description: 'achievements.enteringChatRoom.description',
    icon: 'globe',
    category: 'messaging',
    trigger: { type: 'action', action: 'asl_message_sent' },
  },
  {
    id: 'at_least_i_have_chicken',
    name: 'achievements.atLeastIHaveChicken.name',
    description: 'achievements.atLeastIHaveChicken.description',
    icon: 'fire',
    category: 'messaging',
    trigger: { type: 'action', action: 'leeroy_jenkins_message_sent' },
  },
  {
    id: 'walk_into_mordor',
    name: 'achievements.walkIntoMordor.name',
    description: 'achievements.walkIntoMordor.description',
    icon: 'shield',
    category: 'messaging',
    trigger: { type: 'action', action: 'mordor_message_sent' },
  },
  {
    id: 'ah_ah_ah',
    name: 'achievements.ahAhAh.name',
    description: 'achievements.ahAhAh.description',
    icon: 'key',
    category: 'messaging',
    trigger: { type: 'action', action: 'magic_word_message_sent' },
  },
  {
    id: 'ugh_as_if',
    name: 'achievements.ughAsIf.name',
    description: 'achievements.ughAsIf.description',
    icon: 'smile',
    category: 'messaging',
    trigger: { type: 'action', action: 'as_if_message_sent' },
  },
  {
    id: 'down_the_rabbit_hole',
    name: 'achievements.downTheRabbitHole.name',
    description: 'achievements.downTheRabbitHole.description',
    icon: 'eye',
    category: 'messaging',
    trigger: { type: 'action', action: 'rabbit_hole_message_sent' },
  },

  // -- Messaging (GIFs & stickers, client-detected) --
  {
    id: 'first_gif',
    name: 'achievements.firstGif.name',
    description: 'achievements.firstGif.description',
    icon: 'image',
    category: 'messaging',
    trigger: { type: 'action', action: 'gif_sent' },
  },
  {
    id: 'gif_enthusiast',
    name: 'achievements.gifEnthusiast.name',
    description: 'achievements.gifEnthusiast.description',
    icon: 'image',
    category: 'messaging',
    trigger: { type: 'action', action: 'gifs_sent_25' },
  },
  {
    id: 'first_sticker',
    name: 'achievements.firstSticker.name',
    description: 'achievements.firstSticker.description',
    icon: 'noteSticky',
    category: 'messaging',
    trigger: { type: 'action', action: 'sticker_sent' },
  },
  {
    id: 'sticker_collector',
    name: 'achievements.stickerCollector.name',
    description: 'achievements.stickerCollector.description',
    icon: 'noteSticky',
    category: 'messaging',
    trigger: { type: 'action', action: 'stickers_sent_25' },
  },

  // -- Messaging (memes & phrases, client-detected) --
  {
    id: 'rickroll',
    name: 'achievements.rickroll.name',
    description: 'achievements.rickroll.description',
    icon: 'globe',
    category: 'messaging',
    trigger: { type: 'action', action: 'rickroll_sent' },
  },
  {
    id: 'press_f',
    name: 'achievements.pressF.name',
    description: 'achievements.pressF.description',
    icon: 'trophy',
    category: 'messaging',
    trigger: { type: 'action', action: 'press_f_sent' },
  },
  {
    id: 'over_9000',
    name: 'achievements.overNineThousand.name',
    description: 'achievements.overNineThousand.description',
    icon: 'fire',
    category: 'messaging',
    trigger: { type: 'action', action: 'over_9000_sent' },
  },
  {
    id: 'uwu',
    name: 'achievements.uwu.name',
    description: 'achievements.uwu.description',
    icon: 'heart',
    category: 'messaging',
    trigger: { type: 'action', action: 'uwu_sent' },
  },
  {
    id: 'all_caps',
    name: 'achievements.allCaps.name',
    description: 'achievements.allCaps.description',
    icon: 'warning',
    category: 'messaging',
    trigger: { type: 'action', action: 'all_caps_sent' },
  },
  {
    id: 'laughing_out_loud',
    name: 'achievements.laughingOutLoud.name',
    description: 'achievements.laughingOutLoud.description',
    icon: 'smile',
    category: 'messaging',
    trigger: { type: 'action', action: 'lol_sent' },
  },
  {
    id: 'shrug',
    name: 'achievements.shrug.name',
    description: 'achievements.shrug.description',
    icon: 'ellipsis',
    category: 'messaging',
    trigger: { type: 'action', action: 'shrug_sent' },
  },

  // -- Social (calls) --
  {
    id: 'vienna_calling',
    name: 'achievements.viennaCalling.name',
    description: 'achievements.viennaCalling.description',
    icon: 'video',
    category: 'social',
    trigger: { type: 'action', action: 'call_started' },
  },
  {
    id: 'kthxbye',
    name: 'achievements.kthxbye.name',
    description: 'achievements.kthxbye.description',
    icon: 'phoneHangup',
    category: 'social',
    trigger: { type: 'action', action: 'call_left' },
  },

  // -- Misc (easter egg) --
  {
    id: 'one_in_a_million',
    name: 'achievements.oneInAMillion.name',
    description: 'achievements.oneInAMillion.description',
    icon: 'fire',
    category: 'misc',
    trigger: { type: 'action', action: 'wilhelm_scream' },
  },

  // -- Misc (feedback) --
  {
    id: 'im_helping',
    name: 'achievements.imHelping.name',
    description: 'achievements.imHelping.description',
    icon: 'thumbsUp',
    category: 'misc',
    trigger: { type: 'action', action: 'feedback_upvoted' },
  },
  {
    id: 'big_brain',
    name: 'achievements.bigBrain.name',
    description: 'achievements.bigBrain.description',
    icon: 'trophy',
    category: 'misc',
    trigger: { type: 'action', action: 'feedback_post_10_upvotes' },
  },
  {
    id: 'why_didnt_i_think',
    name: 'achievements.whyDidntIThink.name',
    description: 'achievements.whyDidntIThink.description',
    icon: 'star',
    category: 'misc',
    trigger: { type: 'action', action: 'feedback_suggestion_accepted' },
  },
  {
    id: 'pushed_to_prod',
    name: 'achievements.pushedToProd.name',
    description: 'achievements.pushedToProd.description',
    icon: 'badgeCheck',
    category: 'misc',
    trigger: { type: 'action', action: 'feedback_suggestion_released' },
  },
  {
    id: 'its_all_connected',
    name: 'achievements.itsAllConnected.name',
    description: 'achievements.itsAllConnected.description',
    icon: 'link',
    category: 'misc',
    trigger: { type: 'action', action: 'feedback_post_linked' },
  },

  // -- Misc (entitlement-gated) --
  {
    id: 'sponsor',
    name: 'achievements.sponsor.name',
    description: 'achievements.sponsor.description',
    icon: 'handshake',
    category: 'misc',
    trigger: { type: 'entitlement', entitlement: 'sponsor' },
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
  'message_contains_42',
  'message_contains_420',
  'curse_word_message_sent',
  'curse_word_messages_25',
  'profile_views_25',
  'gif_sent',
  'gifs_sent_25',
  'sticker_sent',
  'stickers_sent_25',
  'rickroll_sent',
  'press_f_sent',
  'over_9000_sent',
  'uwu_sent',
  'all_caps_sent',
  'lol_sent',
  'shrug_sent',
  'wilhelm_scream',
  'prangent_message_sent',
  'priceless_message_sent',
  'synergy_message_sent',
  'brb_message_sent',
  'clippy_message_sent',
  'asl_message_sent',
  'leeroy_jenkins_message_sent',
  'mordor_message_sent',
  'magic_word_message_sent',
  'as_if_message_sent',
  'rabbit_hole_message_sent',
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
