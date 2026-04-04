/**
 * Media upload repository
 * Data access layer for media upload tracking with MongoDB persistence.
 */

import { ObjectId } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { MediaUploadDocument, UploadStatus } from '../models/media-upload';
import { withUpdatedAt } from '../models/base';

export class MediaUploadRepository extends BaseRepository<MediaUploadDocument> {
  constructor() {
    super(Collections.MEDIA_UPLOADS);
  }

  async findByMediaId(mediaId: string): Promise<MediaUploadDocument | null> {
    return await this.findOne({ mediaId });
  }

  async findByMediaIdAndIdentity(
    mediaId: string,
    identityId: string | ObjectId
  ): Promise<MediaUploadDocument | null> {
    const objectId = this.toObjectId(identityId);
    return await this.findOne({ mediaId, identityId: objectId });
  }

  async findByScanHash(scanHash: string): Promise<MediaUploadDocument | null> {
    return await this.findOne({ scanHash });
  }

  async updateStatus(
    mediaId: string,
    status: UploadStatus,
    extra?: Partial<Pick<MediaUploadDocument, 'processedS3Key' | 'cdnUrl' | 'rejectionReason'>>
  ): Promise<MediaUploadDocument | null> {
    const update = withUpdatedAt({ status, ...extra });

    const result = await this.collection.findOneAndUpdate(
      { mediaId },
      { $set: update },
      { returnDocument: 'after' }
    );

    return result as MediaUploadDocument | null;
  }

  async countRecentByIdentity(
    identityId: string | ObjectId,
    windowSeconds: number
  ): Promise<number> {
    const objectId = this.toObjectId(identityId);
    const since = new Date(Date.now() - windowSeconds * 1000);

    return await this.count({
      identityId: objectId,
      createdAt: { $gte: since },
    } as Parameters<typeof this.count>[0]);
  }
}

let mediaUploadRepository: MediaUploadRepository | null = null;

export function getMediaUploadRepository(): MediaUploadRepository {
  if (!mediaUploadRepository) {
    mediaUploadRepository = new MediaUploadRepository();
  }
  return mediaUploadRepository;
}
