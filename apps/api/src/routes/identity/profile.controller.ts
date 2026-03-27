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
import { sanitizeString } from '../../utils';
import {
  getIdentitySessionIdFromRequest,
  getIdentityFromSession,
} from '../../services/identity.service';
import { getIdentityRepository } from '../../repositories/identity.repository';
import { getMediaUploadRepository } from '../../repositories/media-upload.repository';
import { getCollection, Collections } from '../../db';
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
      primary: z.string().regex(HEX_COLOR_REGEX).optional().nullable(),
      secondary: z.string().regex(HEX_COLOR_REGEX).optional().nullable(),
      accent: z.string().regex(HEX_COLOR_REGEX).optional().nullable(),
    })
    .optional(),
  privacySettings: z
    .object({
      avatar: ProfileVisibilityEnum.optional(),
      banner: ProfileVisibilityEnum.optional(),
      bio: ProfileVisibilityEnum.optional(),
      lastActiveAt: ProfileVisibilityEnum.optional(),
      profileColors: ProfileVisibilityEnum.optional(),
    })
    .optional(),
});

/**
 * Check if two identities are mutual friends.
 * Uses the bidirectional friendships collection (two records per friendship).
 */
async function areFriends(
  identityIdA: ObjectId,
  identityIdB: ObjectId
): Promise<boolean> {
  const friendships = getCollection(Collections.FRIENDSHIPS);
  const doc = await friendships.findOne({
    identityId: identityIdA,
    friendIdentityId: identityIdB,
  });
  return doc !== null;
}

/**
 * Apply privacy filtering to a public identity based on viewer relationship.
 *
 * Returns a copy of the profile with fields nulled out according to privacy settings.
 */
function applyPrivacyFilter(
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
  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (!identitySessionId) {
    return ctx.errors.unauthorized();
  }

  const identity = await getIdentityFromSession(identitySessionId);
  if (!identity) {
    return ctx.errors.unauthorized();
  }

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
    const media = await mediaRepo.findByMediaIdAndIdentity(
      data.avatarMediaId,
      identityId
    );
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
    const media = await mediaRepo.findByMediaIdAndIdentity(
      data.bannerMediaId,
      identityId
    );
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
    const colors: Record<string, string | undefined> = {};
    if (data.profileColors.primary !== undefined) {
      colors.primary = data.profileColors.primary ?? undefined;
    }
    if (data.profileColors.secondary !== undefined) {
      colors.secondary = data.profileColors.secondary ?? undefined;
    }
    if (data.profileColors.accent !== undefined) {
      colors.accent = data.profileColors.accent ?? undefined;
    }
    update.profileColors = colors;
  }

  if (data.privacySettings !== undefined) {
    const current = identity.privacySettings ?? { ...DEFAULT_PRIVACY_SETTINGS };
    const merged: ProfilePrivacySettings = {
      avatar: data.privacySettings.avatar ?? current.avatar,
      banner: data.privacySettings.banner ?? current.banner,
      bio: data.privacySettings.bio ?? current.bio,
      lastActiveAt: data.privacySettings.lastActiveAt ?? current.lastActiveAt,
      profileColors:
        data.privacySettings.profileColors ?? current.profileColors,
    };
    update.privacySettings = merged;
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

  return success(toPublicIdentity(updatedDoc), 'Profile updated.');
}

/**
 * GET /identity/:id/profile - Get privacy-filtered profile.
 */
export async function getProfileCtrl(ctx: RouteContext): Promise<Response> {
  const { id } = ctx.params;
  if (!id || id.length !== 24) {
    return ctx.errors.badRequest();
  }

  const repo = getIdentityRepository();
  const doc = await repo.findByIdentityId(id);
  if (!doc) {
    return errors.notFound('Identity not found');
  }

  const publicProfile = toPublicIdentity(doc);

  // Determine viewer identity (optional — unauthenticated viewers see public only)
  let viewerRelation: 'self' | 'friend' | 'stranger' = 'stranger';

  const identitySessionId = getIdentitySessionIdFromRequest(ctx.request);
  if (identitySessionId) {
    const viewerIdentity = await getIdentityFromSession(identitySessionId);
    if (viewerIdentity) {
      if (viewerIdentity._id.equals(doc._id)) {
        viewerRelation = 'self';
      } else {
        const friends = await areFriends(viewerIdentity._id, doc._id);
        if (friends) {
          viewerRelation = 'friend';
        }
      }
    }
  }

  const filtered = applyPrivacyFilter(publicProfile, doc, viewerRelation);

  return success(filtered);
}
