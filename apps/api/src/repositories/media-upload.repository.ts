/**
 * Media upload repository
 * Data access layer for media upload tracking with MongoDB persistence.
 */

import { ObjectId, type Filter } from 'mongodb';
import { BaseRepository } from './base.repository';
import { Collections } from '../db';
import type { MediaUploadDocument, UploadPurpose, UploadStatus } from '../models/media-upload';

const CONV_SCAN_NON_TERMINAL: UploadStatus[] = ['pending', 'uploaded', 'processing'];
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

  /** Pending conv_scan rows for this scanHash (multi-part uploads). */
  async countPendingConvScanByScanHash(scanHash: string): Promise<number> {
    return await this.count({
      scanHash,
      purpose: 'conv_scan' as UploadPurpose,
      status: 'pending',
    } as Filter<MediaUploadDocument>);
  }

  /** Uploaded conv_scan mediaIds for a session (nested layout only). */
  async findUploadedNestedConvScanMediaIdsByScanHash(scanHash: string): Promise<string[]> {
    const docs = await this.findMany(
      {
        scanHash,
        purpose: 'conv_scan' as UploadPurpose,
        status: 'uploaded',
        s3Key: { $regex: /^uploads\/conv_scan\/[0-9a-f]{64}\// },
      } as Filter<MediaUploadDocument>,
      64
    );
    return docs.map((d) => d.mediaId);
  }

  async countConvScanByScanHash(scanHash: string): Promise<number> {
    return await this.count({
      scanHash,
      purpose: 'conv_scan' as UploadPurpose,
    } as Filter<MediaUploadDocument>);
  }

  /** Rows still in flight for moderation (not ready / rejected / failed). */
  async countConvScanNonTerminalByScanHash(scanHash: string): Promise<number> {
    return await this.count({
      scanHash,
      purpose: 'conv_scan' as UploadPurpose,
      status: { $in: CONV_SCAN_NON_TERMINAL },
    } as Filter<MediaUploadDocument>);
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
