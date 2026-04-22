/**
 * Eradicate cleartext conversation scan copies (S3 + optionally media_uploads rows).
 * Platform reports / moderation queue documents are not touched here.
 */

import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Filter } from 'mongodb';
import type { MediaUploadDocument, UploadPurpose } from '../models/media-upload';
import { getMediaUploadRepository } from '../repositories/media-upload.repository';
import elog from './adieuuLogger';

const CONV_SCAN_PURGE_DOC_LIMIT = 128;

export type PurgeConvScanOptions = {
  /** When true, delete conv_scan rows in media_uploads (abandoned / never-completed sessions). */
  removeDbRows: boolean;
  s3Client: S3Client;
  mediaBucket: string | undefined;
};

/**
 * Delete all S3 objects under uploads/conv_scan/{scanHash}/ and any conv_scan rows
 * registered for that scanHash, plus per-row keys (covers legacy flat layout).
 */
export async function purgeConvScanCleartextArtifacts(
  scanHash: string,
  options: PurgeConvScanOptions
): Promise<void> {
  if (!scanHash || scanHash.length !== 64) return;

  const mediaRepo = getMediaUploadRepository();
  const docs = await mediaRepo.findMany(
    {
      scanHash,
      purpose: 'conv_scan' as UploadPurpose,
    } as Filter<MediaUploadDocument>,
    CONV_SCAN_PURGE_DOC_LIMIT
  );

  if (docs.length >= CONV_SCAN_PURGE_DOC_LIMIT) {
    elog.warn('conv_scan purge hit doc limit; increase CONV_SCAN_PURGE_DOC_LIMIT if needed', {
      scanHash,
      count: docs.length,
    });
  }

  const { s3Client, mediaBucket, removeDbRows } = options;

  if (mediaBucket) {
    const seen = new Set<string>();
    for (const d of docs) {
      if (!d.s3Key || seen.has(d.s3Key)) continue;
      seen.add(d.s3Key);
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: mediaBucket,
            Key: d.s3Key,
          })
        );
      } catch (err) {
        elog.error('Failed to delete conv_scan object during purge', {
          scanHash,
          s3Key: d.s3Key,
          err,
        });
      }
    }

    const prefix = `uploads/conv_scan/${scanHash}/`;
    let continuationToken: string | undefined;
    do {
      const list = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: mediaBucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        })
      );
      const keys = (list.Contents ?? [])
        .map((o) => o.Key)
        .filter((k): k is string => Boolean(k));
      if (keys.length > 0) {
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: mediaBucket,
            Delete: {
              Objects: keys.map((Key) => ({ Key })),
              Quiet: true,
            },
          })
        );
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  if (removeDbRows) {
    const deleted = await mediaRepo.deleteManyConvScanByScanHash(scanHash);
    elog.info('conv_scan media_upload rows removed', { scanHash, deleted });
  }
}
