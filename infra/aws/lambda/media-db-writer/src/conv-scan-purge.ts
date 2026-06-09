/**
 * Purge conv_scan cleartext artifacts after a clean moderation pass.
 */

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import type { Db } from 'mongodb';

const MEDIA_UPLOADS_COLLECTION = 'media_uploads';
const PLATFORM_REPORTS_COLLECTION = 'platform_reports';
const CONV_SCAN_PREFIX = 'uploads/conv_scan/';

export async function countOpenHashCheckReportsByScanHash(
  db: Db,
  scanHash: string
): Promise<number> {
  return await db.collection(PLATFORM_REPORTS_COLLECTION).countDocuments({
    source: 'automated_hash_check',
    status: { $in: ['open', 'escalated'] },
    'detectionMetadata.scanHash': scanHash,
  });
}

export async function purgeConvScanCleartext(
  db: Db,
  s3Client: S3Client | null,
  mediaBucket: string | undefined,
  scanHash: string
): Promise<{ s3KeysDeleted: number; mongoRowsDeleted: number }> {
  if (!scanHash || !/^[0-9a-f]{64}$/i.test(scanHash)) {
    return { s3KeysDeleted: 0, mongoRowsDeleted: 0 };
  }

  const normalized = scanHash.toLowerCase();
  let s3KeysDeleted = 0;

  if (s3Client && mediaBucket) {
    const prefix = `${CONV_SCAN_PREFIX}${normalized}/`;
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
        s3KeysDeleted += keys.length;
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  const deleteResult = await db.collection(MEDIA_UPLOADS_COLLECTION).deleteMany({
    scanHash: normalized,
    purpose: 'conv_scan',
  });

  return {
    s3KeysDeleted,
    mongoRowsDeleted: deleteResult.deletedCount,
  };
}
