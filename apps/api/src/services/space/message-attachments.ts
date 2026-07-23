/**
 * Space message attachment validation (cleartext `space_media` + E2E media).
 *
 * @module services/space/message-attachments
 */

import { ObjectId } from 'mongodb';
import { SPACE_MESSAGE_MAX_ATTACHMENTS } from '@adieuu/shared';
import { getMediaUploadRepository } from '../../repositories/media-upload.repository';
import { getE2EMediaRepository } from '../../repositories/e2e-media.repository';
import type { SpaceMessageAttachmentDoc } from '../../models/space-message';
import type { SpaceErrorCode } from './types';

export type AttachmentValidationFailure = {
  success: false;
  error: string;
  errorCode: SpaceErrorCode;
};

export type CleartextAttachmentValidationSuccess = {
  success: true;
  attachmentMediaIds: string[];
  attachments: SpaceMessageAttachmentDoc[];
};

export type E2EAttachmentValidationSuccess = {
  success: true;
  e2eMediaIds: string[];
};

function dedupeIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Validate cleartext `space_media` ids for a plaintext channel send.
 * Requires purpose space_media, owner=sender, status ready, matching spaceId.
 */
export async function validateSpaceCleartextAttachments(
  spaceId: ObjectId,
  senderId: ObjectId,
  attachmentMediaIds: string[],
): Promise<CleartextAttachmentValidationSuccess | AttachmentValidationFailure> {
  if (attachmentMediaIds.length > SPACE_MESSAGE_MAX_ATTACHMENTS) {
    return {
      success: false,
      error: `Maximum ${SPACE_MESSAGE_MAX_ATTACHMENTS} attachments allowed.`,
      errorCode: 'INVALID_MEDIA',
    };
  }
  if (attachmentMediaIds.length === 0) {
    return { success: true, attachmentMediaIds: [], attachments: [] };
  }

  const uniqueIds = dedupeIds(attachmentMediaIds);
  const mediaRepo = getMediaUploadRepository();
  const attachments: SpaceMessageAttachmentDoc[] = [];

  for (const mediaId of uniqueIds) {
    const doc = await mediaRepo.findByMediaId(mediaId);
    if (!doc || doc.purpose !== 'space_media') {
      return {
        success: false,
        error: 'One or more media references are invalid.',
        errorCode: 'INVALID_MEDIA',
      };
    }
    if (doc.status !== 'ready' || !doc.cdnUrl) {
      return {
        success: false,
        error: 'One or more attachments are not ready.',
        errorCode: 'INVALID_MEDIA',
      };
    }
    if (!doc.identityId?.equals(senderId)) {
      return {
        success: false,
        error: 'One or more attachments do not belong to the sender.',
        errorCode: 'INVALID_MEDIA',
      };
    }
    if (!doc.spaceId?.equals(spaceId)) {
      return {
        success: false,
        error: 'One or more attachments belong to a different Space.',
        errorCode: 'INVALID_MEDIA',
      };
    }
    attachments.push({
      mediaId: doc.mediaId,
      cdnUrl: doc.cdnUrl,
      contentType: doc.contentType,
    });
  }

  return { success: true, attachmentMediaIds: uniqueIds, attachments };
}

/**
 * Validate E2E media ids for an encrypted channel send (mirrors DM checks).
 */
export async function validateSpaceE2EAttachments(
  senderId: ObjectId,
  e2eMediaIds: string[],
): Promise<E2EAttachmentValidationSuccess | AttachmentValidationFailure> {
  if (e2eMediaIds.length > SPACE_MESSAGE_MAX_ATTACHMENTS) {
    return {
      success: false,
      error: `Maximum ${SPACE_MESSAGE_MAX_ATTACHMENTS} attachments allowed.`,
      errorCode: 'INVALID_MEDIA',
    };
  }
  if (e2eMediaIds.length === 0) {
    return { success: true, e2eMediaIds: [] };
  }

  const uniqueIds = dedupeIds(e2eMediaIds);
  const e2eRepo = getE2EMediaRepository();
  const mediaRecords = await e2eRepo.findManyByE2EMediaIds(uniqueIds);

  if (mediaRecords.length !== uniqueIds.length) {
    return {
      success: false,
      error: 'One or more E2E media references not found.',
      errorCode: 'INVALID_MEDIA',
    };
  }

  for (const media of mediaRecords) {
    if (!media.identityId.equals(senderId)) {
      return {
        success: false,
        error: 'E2E media does not belong to sender.',
        errorCode: 'INVALID_MEDIA',
      };
    }
    if (media.status === 'pending') {
      return {
        success: false,
        error: 'E2E media upload has not been completed.',
        errorCode: 'INVALID_MEDIA',
      };
    }
    if (media.moderationStatus === 'rejected') {
      return {
        success: false,
        error: 'E2E media has not cleared moderation.',
        errorCode: 'INVALID_MEDIA',
      };
    }
  }

  return { success: true, e2eMediaIds: uniqueIds };
}
