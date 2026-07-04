/**
 * Identity profile controller.
 *
 * Handles profile updates (PATCH /identity/me/profile) and
 * privacy-filtered profile views (GET /identity/:id/profile).
 *
 * SECURITY:
 * - Privacy enforcement is entirely server-side: the API never returns
 *   URLs or field values the viewer is not authorised to see.
 * - Friendship checks use the existing bidirectional friendships collection.
 * - Avatar/banner updates accept a mediaId and verify ownership + ready status.
 */

import { z } from '@adieuu/shared/schemas';
import { ObjectId } from 'mongodb';
import type { RouteContext } from '../../router/types';
import { success, errors } from '../../utils/response';
import { sanitizeObjectId, sanitizeString } from '../../utils/sanitize';
import { checkAndAward } from '../../services/achievement.service';
import { checkDisplayNameChangeAchievements } from '../../services/display-name-achievement.service';
import { checkBioAchievements } from '../../services/bio-achievement.service';
import { awardPopCultureTextAchievements } from '../../services/pop-culture-text-achievement.service';
import {
  awardTvReferenceBioAchievements,
  awardTvReferenceDisplayNameAchievements,
} from '../../services/tv-reference-text-achievement.service';
import { publishProfileUpdated } from '../../services/profile-event.service';
import { hasPaidAccess } from '../../services/billing/resolve-access';
import { contrastRatio } from '../../utils/color';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getMediaUploadRepository } from '../../repositories/media-upload.repository';
import { getFriendshipRepository } from '../../repositories/friendship.repository';
import {
  toPublicIdentity,
  DEFAULT_PRIVACY_SETTINGS,
  type PublicIdentity,
  type ProfileVisibility,
  type ProfilePrivacySettings,
  type IdentityDocument,
} from '../../models/identity';

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

const ProfileVisibilityEnum = z.enum(['public', 'friends', 'private']);

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(160).optional(),
  avatarMediaId: z.string().max(200).optional(),
  bannerMediaId: z.string().max(200).optional(),
  removeAvatar: z.boolean().optional(),
  removeBanner: z.boolean().optional(),
  profileColors: z
    .object({
      accent: z.string().regex(HEX_COLOR_REGEX).optional().nullable(),
      cardBackground: z.string().regex(HEX_COLOR_REGEX).optional().nullable(),
      background: z.string().regex(HEX_COLOR_REGEX).optional().nullable(),
    })
    .optional(),
  privacySettings: z
    .object({
      avatar: ProfileVisibilityEnum.optional(),
      banner: ProfileVisibilityEnum.optional(),
      bio: ProfileVisibilityEnum.optional(),
      lastActiveAt: ProfileVisibilityEnum.optional(),
      profileColors: ProfileVisibilityEnum.optional(),
      achievements: ProfileVisibilityEnum.optional(),
    })
    .optional(),
  requireGroupApproval: z.boolean().optional(),
});

/**
 * Check if two identities are mutual friends.
 * Uses the bidirectional friendships collection (two records per friendship).
 */
export async function areFriends(
  identityIdA: ObjectId,
  identityIdB: ObjectId
): Promise<boolean> {
  return getFriendshipRepository().areFriends(identityIdA, identityIdB);
}

/**
 * Apply privacy filtering to a public identity based on viewer relationship.
 *
 * Returns a copy of the profile with fields nulled out according to privacy settings.
 */
export function applyPrivacyFilter(
  profile: PublicIdentity,
  doc: IdentityDocument,
  viewerRelation: 'self' | 'friend' | 'stranger'
): PublicIdentity {
  if (viewerRelation === 'self') {
    return profile;
  }

  const privacy = doc.privacySettings ?? DEFAULT_PRIVACY_SETTINGS;
  const filtered = { ...profile };

  const isVisible = (setting: ProfileVisibility): boolean => {
    if (setting === 'public') return true;
    if (setting === 'friends' && viewerRelation === 'friend') return true;
    return false;
  };

  if (!isVisible(privacy.avatar)) {
    filtered.avatarUrl = undefined;
  }
  if (!isVisible(privacy.banner)) {
    filtered.bannerUrl = undefined;
  }
  if (!isVisible(privacy.bio)) {
    filtered.bio = undefined;
  }
  if (!isVisible(privacy.lastActiveAt)) {
    filtered.lastActiveAt = '';
  }
  if (!isVisible(privacy.profileColors)) {
    filtered.profileColors = undefined;
  }

  // Only the owner sees their own privacy settings
  filtered.privacySettings = undefined;

  return filtered;
}

/**
 * PATCH /identity/me/profile - Update own profile.
 */
export async function updateProfileCtrl(ctx: RouteContext): Promise<Response> {
  if (!ctx.identitySession) return ctx.errors.unauthorized();
  const { identity } = ctx.identitySession;

  const parseResult = UpdateProfileSchema.safeParse(ctx.body);
  if (!parseResult.success) {
    return ctx.errors.validationFailed();
  }

  const data = parseResult.data;
  const identityId = identity._id.toHexString();
  const repo = getIdentityRepository();

  const update: Record<string, unknown> = {};

  if (data.displayName !== undefined) {
    const sanitized = sanitizeString(data.displayName, 'general');
    if (!sanitized.value || sanitized.value.length === 0) {
      return errors.badRequest('Display name cannot be empty');
    }
    update.displayName = sanitized.value;
  }

  if (data.bio !== undefined) {
    const sanitized = sanitizeString(data.bio, 'general');
    update.bio = sanitized.value || '';
  }

  if (data.removeAvatar) {
    update.avatarUrl = null;
  } else if (data.avatarMediaId) {
    const mediaRepo = getMediaUploadRepository();
    const sanitizedMediaId =
      sanitizeString(data.avatarMediaId, 'idenhanced').value ?? '';
    if (!sanitizedMediaId) {
      return errors.badRequest('Invalid avatar media ID');
    }
    const media = await mediaRepo.findByMediaIdAndIdentity(sanitizedMediaId, identityId);
    if (!media) {
      return errors.notFound('Avatar media not found');
    }
    if (media.status !== 'ready' || !media.cdnUrl) {
      return errors.badRequest('Avatar media is not ready yet');
    }
    if (media.purpose !== 'avatar') {
      return errors.badRequest('Media was not uploaded as an avatar');
    }
    update.avatarUrl = media.cdnUrl;
  }

  if (data.removeBanner) {
    update.bannerUrl = null;
  } else if (data.bannerMediaId) {
    const mediaRepo = getMediaUploadRepository();
    const sanitizedMediaId =
      sanitizeString(data.bannerMediaId, 'idenhanced').value ?? '';
    if (!sanitizedMediaId) {
      return errors.badRequest('Invalid banner media ID');
    }
    const media = await mediaRepo.findByMediaIdAndIdentity(sanitizedMediaId, identityId);
    if (!media) {
      return errors.notFound('Banner media not found');
    }
    if (media.status !== 'ready' || !media.cdnUrl) {
      return errors.badRequest('Banner media is not ready yet');
    }
    if (media.purpose !== 'banner') {
      return errors.badRequest('Media was not uploaded as a banner');
    }
    update.bannerUrl = media.cdnUrl;
  }

  if (data.profileColors !== undefined) {
    if (!hasPaidAccess(ctx.identitySession!)) {
      return errors.forbidden('Upgrade to a paid plan to customize profile colors.');
    }
    const colors: Record<string, string | undefined> = {};
    if (data.profileColors.accent !== undefined) {
      colors.accent = data.profileColors.accent ?? undefined;
    }
    if (data.profileColors.cardBackground !== undefined) {
      colors.cardBackground = data.profileColors.cardBackground ?? undefined;
    }
    if (data.profileColors.background !== undefined) {
      colors.background = data.profileColors.background ?? undefined;
    }
    update.profileColors = colors;
  }

  let mergedPrivacy: ProfilePrivacySettings | undefined;
  if (data.privacySettings !== undefined) {
    const current = identity.privacySettings ?? { ...DEFAULT_PRIVACY_SETTINGS };
    mergedPrivacy = {
      avatar: data.privacySettings.avatar ?? current.avatar,
      banner: data.privacySettings.banner ?? current.banner,
      bio: data.privacySettings.bio ?? current.bio,
      lastActiveAt: data.privacySettings.lastActiveAt ?? current.lastActiveAt,
      profileColors:
        data.privacySettings.profileColors ?? current.profileColors,
      achievements:
        data.privacySettings.achievements ?? current.achievements,
    };
    update.privacySettings = mergedPrivacy;
  }

  if (data.requireGroupApproval !== undefined) {
    update.requireGroupApproval = data.requireGroupApproval;
  }

  if (Object.keys(update).length === 0) {
    return errors.badRequest('No fields to update');
  }

  const updatedDoc = await repo.updateByIdent(
    identity.ident,
    update as Parameters<typeof repo.updateByIdent>[1]
  );

  if (!updatedDoc) {
    return errors.internal('Failed to update profile');
  }

  if (update.bannerUrl) {
    checkAndAward(identity._id, 'banner_set').catch(() => {});
  }
  if (update.avatarUrl || update.bio !== undefined || update.profileColors) {
    checkAndAward(identity._id, 'profile_customized').catch(() => {});
  }

  if (mergedPrivacy) {
    if (mergedPrivacy.avatar === 'private' && mergedPrivacy.banner === 'private' && mergedPrivacy.bio === 'private') {
      checkAndAward(identity._id, 'privacy_all_private').catch(() => {});
    }
    if (mergedPrivacy.lastActiveAt === 'private') {
      checkAndAward(identity._id, 'last_active_private').catch(() => {});
    }
  }

  if (update.profileColors) {
    const mergedColors = { ...identity.profileColors, ...data.profileColors };
    if (mergedColors.accent && mergedColors.cardBackground) {
      const ratio = contrastRatio(mergedColors.accent, mergedColors.cardBackground);
      if (ratio >= 7) {
        checkAndAward(identity._id, 'profile_colors_high_contrast').catch(() => {});
      }
    }
  }

  if (update.displayName && update.displayName !== identity.displayName) {
    checkDisplayNameChangeAchievements(identity._id, update.displayName as string).catch(() => {});
  }

  if (data.bio !== undefined) {
    const bio = update.bio as string;
    checkBioAchievements(identity._id, bio).catch(() => {});
    awardPopCultureTextAchievements(identity._id, bio);
    awardTvReferenceBioAchievements(identity._id, bio);
  }

  if (data.displayName !== undefined) {
    awardPopCultureTextAchievements(identity._id, update.displayName as string);
    awardTvReferenceDisplayNameAchievements(identity._id, update.displayName as string);
  }

  publishProfileUpdated(identityId).catch(() => {});

  return success(toPublicIdentity(updatedDoc), 'Profile updated.');
}

/**
 * GET /identity/:id/profile - Get privacy-filtered profile.
 */
export async function getProfileCtrl(ctx: RouteContext): Promise<Response> {
  const parsed = sanitizeObjectId(ctx.params.id);
  if (!parsed.ok) {
    return ctx.errors.badRequest();
  }

  const repo = getIdentityRepository();
  const doc = await repo.findByIdentityId(parsed.id);
  if (!doc) {
    return errors.notFound('Identity not found');
  }

  const publicProfile = toPublicIdentity(doc);

  // Determine viewer identity (optional — unauthenticated viewers see public only)
  let viewerRelation: 'self' | 'friend' | 'stranger' = 'stranger';

  if (ctx.identitySession) {
    const viewerIdentity = ctx.identitySession.identity;
    if (viewerIdentity._id.equals(doc._id)) {
      viewerRelation = 'self';
    } else {
      const friends = await areFriends(viewerIdentity._id, doc._id);
      if (friends) {
        viewerRelation = 'friend';
      }
    }
  }

  const filtered = applyPrivacyFilter(publicProfile, doc, viewerRelation);

  return success(filtered);
}
