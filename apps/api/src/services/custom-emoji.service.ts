/**
 * Custom emoji service
 *
 * CRUD operations for user-uploaded custom emojis with ownership
 * verification, shortcode validation, and subscription-tier limits.
 *
 * @module services/custom-emoji
 */

import { ObjectId } from 'mongodb';
import type { SubscriptionTierId } from '@adieuu/shared';
import { CUSTOM_EMOJI_SHORTCODE_BODY_RE } from '@adieuu/shared';
import { getCustomEmojiRepository } from '../repositories/custom-emoji.repository';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import {
  toPublicCustomEmoji,
  type CustomEmojiDocument,
  type PublicCustomEmoji,
} from '../models/custom-emoji';
import { CUSTOM_EMOJI_LIMITS } from '../constants/custom-emoji-limits';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

// Re-exported for tests
export { COLON_SHORTCODES_SET } from './custom-emoji-shortcodes';
import { COLON_SHORTCODES_SET } from './custom-emoji-shortcodes';

// ---------------------------------------------------------------------------
// Tier-limit resolution
// ---------------------------------------------------------------------------

export function resolveCustomEmojiLimit(
  subscriptions: SubscriptionTierId[],
  isLifetime: boolean,
): number {
  if (isLifetime) return CUSTOM_EMOJI_LIMITS.lifetime;
  if (subscriptions.includes('insider')) return CUSTOM_EMOJI_LIMITS.insider;
  if (subscriptions.includes('access')) return CUSTOM_EMOJI_LIMITS.access;
  return 0;
}

// ---------------------------------------------------------------------------
// Shortcode validation
// ---------------------------------------------------------------------------

function validateShortcodeFormat(shortcode: string): string | null {
  if (!CUSTOM_EMOJI_SHORTCODE_BODY_RE.test(shortcode)) {
    return 'Shortcode must be 2-32 lowercase letters, numbers, underscores, or hyphens';
  }
  return null;
}

function isDefaultEmojiShortcode(shortcode: string): boolean {
  return COLON_SHORTCODES_SET.has(shortcode);
}

// ---------------------------------------------------------------------------
// Service result types
// ---------------------------------------------------------------------------

interface ServiceResult<T = PublicCustomEmoji> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createCustomEmoji(input: {
  identityId: string;
  shortcode: string;
  name: string;
  mediaId: string;
  subscriptions: SubscriptionTierId[];
  isLifetime: boolean;
}): Promise<ServiceResult> {
  const { identityId, name, mediaId, subscriptions, isLifetime } = input;
  const shortcode = input.shortcode.toLowerCase();

  const formatError = validateShortcodeFormat(shortcode);
  if (formatError) {
    return { success: false, error: formatError, errorCode: 'INVALID_SHORTCODE' };
  }

  if (isDefaultEmojiShortcode(shortcode)) {
    return {
      success: false,
      error: 'This shortcode conflicts with a built-in emoji',
      errorCode: 'SHORTCODE_CONFLICT',
    };
  }

  if (!name || name.length < 1 || name.length > 64) {
    return { success: false, error: 'Name must be 1-64 characters', errorCode: 'INVALID_NAME' };
  }

  const limit = resolveCustomEmojiLimit(subscriptions, isLifetime);
  if (limit === 0) {
    return { success: false, error: 'Subscription required', errorCode: 'SUBSCRIPTION_REQUIRED' };
  }

  const repo = getCustomEmojiRepository();
  const count = await repo.countByIdentityId(identityId);
  if (count >= limit) {
    return {
      success: false,
      error: `Custom emoji limit reached (${limit})`,
      errorCode: 'LIMIT_REACHED',
    };
  }

  const existing = await repo.findByShortcode(shortcode);
  if (existing) {
    return { success: false, error: 'This shortcode is already taken', errorCode: 'SHORTCODE_TAKEN' };
  }

  const mediaRepo = getMediaUploadRepository();
  const upload = await mediaRepo.findByMediaIdAndIdentity(mediaId, identityId);
  if (!upload) {
    return { success: false, error: 'Upload not found', errorCode: 'UPLOAD_NOT_FOUND' };
  }
  if (upload.status !== 'ready') {
    return { success: false, error: 'Upload is not ready', errorCode: 'UPLOAD_NOT_READY' };
  }
  if (upload.purpose !== 'custom_emoji') {
    return { success: false, error: 'Upload purpose mismatch', errorCode: 'UPLOAD_PURPOSE_MISMATCH' };
  }
  if (!upload.cdnUrl) {
    return { success: false, error: 'Upload has no CDN URL', errorCode: 'UPLOAD_NO_CDN' };
  }

  const animated = upload.contentType === 'image/gif';

  const doc = await repo.create({
    identityId: new ObjectId(identityId),
    shortcode,
    name,
    mediaId,
    cdnUrl: upload.cdnUrl,
    animated,
    contentType: upload.contentType,
  });

  return { success: true, data: toPublicCustomEmoji(doc) };
}

export async function listCustomEmojis(
  identityId: string,
): Promise<ServiceResult<PublicCustomEmoji[]>> {
  const repo = getCustomEmojiRepository();
  const docs = await repo.findByIdentityId(identityId);
  return { success: true, data: docs.map(toPublicCustomEmoji) };
}

export async function getCustomEmoji(
  emojiId: string,
): Promise<ServiceResult> {
  const repo = getCustomEmojiRepository();
  const doc = await repo.findById(emojiId);
  if (!doc) {
    return { success: false, error: 'Custom emoji not found', errorCode: 'NOT_FOUND' };
  }
  return { success: true, data: toPublicCustomEmoji(doc) };
}

export async function updateCustomEmoji(input: {
  emojiId: string;
  identityId: string;
  shortcode?: string;
  name?: string;
}): Promise<ServiceResult> {
  const { emojiId, identityId } = input;

  const repo = getCustomEmojiRepository();
  const doc = await repo.findById(emojiId);
  if (!doc) {
    return { success: false, error: 'Custom emoji not found', errorCode: 'NOT_FOUND' };
  }
  if (doc.identityId.toHexString() !== identityId) {
    return { success: false, error: 'Not the owner', errorCode: 'NOT_OWNER' };
  }

  const newShortcode = input.shortcode ? input.shortcode.toLowerCase() : doc.shortcode;
  const newName = input.name ?? doc.name;

  if (input.shortcode) {
    const formatError = validateShortcodeFormat(newShortcode);
    if (formatError) {
      return { success: false, error: formatError, errorCode: 'INVALID_SHORTCODE' };
    }

    if (isDefaultEmojiShortcode(newShortcode)) {
      return {
        success: false,
        error: 'This shortcode conflicts with a built-in emoji',
        errorCode: 'SHORTCODE_CONFLICT',
      };
    }

    if (newShortcode !== doc.shortcode) {
      const existing = await repo.findByShortcode(newShortcode);
      if (existing) {
        return { success: false, error: 'This shortcode is already taken', errorCode: 'SHORTCODE_TAKEN' };
      }
    }
  }

  if (newName.length < 1 || newName.length > 64) {
    return { success: false, error: 'Name must be 1-64 characters', errorCode: 'INVALID_NAME' };
  }

  const updated = await repo.updateShortcodeAndName(emojiId, newShortcode, newName);
  if (!updated) {
    return { success: false, error: 'Update failed', errorCode: 'UPDATE_FAILED' };
  }

  return { success: true, data: toPublicCustomEmoji(updated) };
}

export async function deleteCustomEmoji(input: {
  emojiId: string;
  identityId: string;
}): Promise<ServiceResult<void>> {
  const { emojiId, identityId } = input;

  const repo = getCustomEmojiRepository();
  const doc = await repo.findById(emojiId);
  if (!doc) {
    return { success: false, error: 'Custom emoji not found', errorCode: 'NOT_FOUND' };
  }
  if (doc.identityId.toHexString() !== identityId) {
    return { success: false, error: 'Not the owner', errorCode: 'NOT_OWNER' };
  }

  await repo.deleteById(emojiId);

  cleanupS3Assets(doc).catch((err) => {
    elog.warn('Failed to cleanup S3 assets for deleted custom emoji', {
      emojiId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return { success: true };
}

// ---------------------------------------------------------------------------
// S3 cleanup (best-effort, async)
// ---------------------------------------------------------------------------

async function cleanupS3Assets(doc: CustomEmojiDocument): Promise<void> {
  if (!config.s3.mediaBucket) return;

  const s3 = new S3Client({ region: config.s3.region });

  const mediaRepo = getMediaUploadRepository();
  const upload = await mediaRepo.findByMediaId(doc.mediaId);
  if (!upload) return;

  const keysToDelete = [upload.s3Key, upload.processedS3Key].filter(Boolean) as string[];
  await Promise.allSettled(
    keysToDelete.map((key) =>
      s3.send(new DeleteObjectCommand({ Bucket: config.s3.mediaBucket, Key: key }))
    ),
  );

  await mediaRepo.deleteById(upload._id);
}
