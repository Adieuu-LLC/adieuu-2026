/**
 * Batch moderation for conversation scan copies under uploads/conv_scan/{scanHash}/.
 * Content objects are uploaded first; API writes .sealed when the client completes the scan upload.
 */

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import {
  DetectModerationLabelsCommand,
  type RekognitionClient,
} from '@aws-sdk/client-rekognition';

const CONV_SCAN_PREFIX = 'uploads/conv_scan/';
const NESTED_SCAN_HASH_RE = /^uploads\/conv_scan\/([0-9a-f]{64})\//;
const SEAL_SUFFIX = '/.sealed';

/** Max image (or single legacy video) objects processed in one sealed batch. */
export const CONV_SCAN_BATCH_MAX_OBJECTS = 32;

export function parseNestedConvScanScanHashFromKey(key: string): string | null {
  const m = key.match(NESTED_SCAN_HASH_RE);
  return m?.[1] ?? null;
}

export function isConvScanSealObjectKey(key: string): boolean {
  return key.endsWith(SEAL_SUFFIX) && NESTED_SCAN_HASH_RE.test(key);
}

/** Client/API manifest for batch scan sessions — never sent to Rekognition. */
export function isConvScanManifestObjectKey(key: string): boolean {
  return /\/manifest\.json$/.test(key);
}

/** True when this object is under uploads/conv_scan/{scanHash}/ but is not the seal marker. */
export function shouldDeferNestedConvScanObject(key: string, purpose: string): boolean {
  if (purpose !== 'conv_scan') return false;
  return parseNestedConvScanScanHashFromKey(key) !== null && !isConvScanSealObjectKey(key);
}

export interface ConvScanSealBatchDeps {
  bucket: string;
  sealKey: string;
  scanHash: string;
  primaryMediaId: string;
  purpose: string;
  identityId: string;
  stripExif: boolean;
  contentModeration: boolean;
  moderationConfidence: number;
  s3: S3Client;
  rekognition: RekognitionClient;
  invokeDbWriter: (
    mediaId: string,
    status: 'ready' | 'rejected' | 'failed',
    processedS3Key?: string,
    rejectionReason?: string,
    context?: { purpose?: string; s3Key?: string }
  ) => Promise<void>;
  logProcessorEvent: (event: Record<string, unknown>) => void;
  startConvScanVideoContentModeration: (key: string, meta: {
    mediaId: string;
    purpose: string;
    identityId: string;
    stripExif: boolean;
    contentModeration: boolean;
  }) => Promise<void>;
}

function processingMetaFromDeps(d: ConvScanSealBatchDeps): {
  mediaId: string;
  purpose: string;
  identityId: string;
  stripExif: boolean;
  contentModeration: boolean;
} {
  return {
    mediaId: d.primaryMediaId,
    purpose: d.purpose,
    identityId: d.identityId,
    stripExif: d.stripExif,
    contentModeration: d.contentModeration,
  };
}

async function deleteKeys(s3: S3Client, bucket: string, keys: string[]): Promise<void> {
  for (const Key of keys) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key }));
    } catch {
      /* best-effort */
    }
  }
}

function convScanKeysToDelete(
  moderationContentKeys: string[],
  prefix: string,
  sealKey: string
): string[] {
  return [...moderationContentKeys, `${prefix}manifest.json`, sealKey];
}

/** Cap for unmoderated batch: list+delete under a scan prefix (defence in depth). */
const CONV_SCAN_LIST_ALL_MAX = 5000;

async function listAllKeysInPrefix(
  s3: S3Client,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  while (keys.length < CONV_SCAN_LIST_ALL_MAX) {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    for (const c of out.Contents ?? []) {
      if (c.Key) keys.push(c.Key);
    }
    if (!out.IsTruncated) break;
    continuationToken = out.NextContinuationToken;
  }
  return keys;
}

/** Content keys under prefix excluding `.sealed`, up to `limit` (paginated). */
async function listConvScanContentKeys(
  s3: S3Client,
  bucket: string,
  prefix: string,
  limit: number
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const out = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    );
    for (const c of out.Contents ?? []) {
      const k = c.Key;
      if (!k || k.endsWith(SEAL_SUFFIX) || isConvScanManifestObjectKey(k)) continue;
      keys.push(k);
      if (keys.length >= limit) return keys;
    }
    continuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}

/**
 * After .sealed is written: list all objects in the scan prefix, moderate images (or one MP4),
 * invoke DB writer once, delete cleartext objects.
 */
export async function processConvScanSealBatch(d: ConvScanSealBatchDeps): Promise<void> {
  const prefix = `${CONV_SCAN_PREFIX}${d.scanHash}/`;
  const metaBase = processingMetaFromDeps(d);

  if (!d.contentModeration) {
    const unmodKeys = await listAllKeysInPrefix(d.s3, d.bucket, prefix);
    await deleteKeys(d.s3, d.bucket, unmodKeys);
    await d.invokeDbWriter(d.primaryMediaId, 'ready', undefined, undefined, {
      purpose: d.purpose,
      s3Key: d.sealKey,
    });
    return;
  }

  const keys = await listConvScanContentKeys(
    d.s3,
    d.bucket,
    prefix,
    CONV_SCAN_BATCH_MAX_OBJECTS
  );

  if (keys.length === 0) {
    d.logProcessorEvent({
      event: 'conv_scan_seal_batch_empty',
      mediaId: d.primaryMediaId,
      scanHash: d.scanHash,
      s3Key: d.sealKey,
    });
    await deleteKeys(d.s3, d.bucket, [d.sealKey]);
    return;
  }

  const typed: { key: string; contentType: string }[] = [];
  for (const key of keys) {
    const head = await d.s3.send(
      new HeadObjectCommand({ Bucket: d.bucket, Key: key })
    );
    typed.push({ key, contentType: head.ContentType ?? '' });
  }

  const videos = typed.filter((t) => t.contentType.startsWith('video/'));
  const images = typed.filter((t) => t.contentType.startsWith('image/'));

  if (images.length === 0 && videos.length === 0) {
    d.logProcessorEvent({
      event: 'conv_scan_seal_no_moderatable_objects',
      mediaId: d.primaryMediaId,
      scanHash: d.scanHash,
      keyCount: keys.length,
    });
    const allToDelete = convScanKeysToDelete(keys, prefix, d.sealKey);
    await deleteKeys(d.s3, d.bucket, allToDelete);
    await d.invokeDbWriter(d.primaryMediaId, 'failed', undefined, undefined, {
      purpose: d.purpose,
      s3Key: d.sealKey,
    });
    return;
  }

  if (videos.length > 1 || (videos.length === 1 && images.length > 0)) {
    d.logProcessorEvent({
      event: 'conv_scan_seal_batch_invalid_mix',
      mediaId: d.primaryMediaId,
      scanHash: d.scanHash,
      videoCount: videos.length,
      imageCount: images.length,
    });
    const allToDelete = convScanKeysToDelete(keys, prefix, d.sealKey);
    await deleteKeys(d.s3, d.bucket, allToDelete);
    await d.invokeDbWriter(d.primaryMediaId, 'failed', undefined, undefined, {
      purpose: d.purpose,
      s3Key: d.sealKey,
    });
    return;
  }

  if (videos.length === 1) {
    const vk = videos[0]!.key;
    await deleteKeys(d.s3, d.bucket, convScanKeysToDelete([], prefix, d.sealKey));
    await d.startConvScanVideoContentModeration(vk, { ...metaBase, mediaId: d.primaryMediaId });
    return;
  }

  try {
    for (const img of images) {
      const moderationResult = await d.rekognition.send(
        new DetectModerationLabelsCommand({
          Image: { S3Object: { Bucket: d.bucket, Name: img.key } },
          MinConfidence: d.moderationConfidence,
        })
      );
      const labels = moderationResult.ModerationLabels ?? [];
      if (labels.length > 0) {
        const top = labels[0];
        d.logProcessorEvent({
          event: 'rekognition_moderation_flagged',
          mediaId: d.primaryMediaId,
          purpose: d.purpose,
          s3Key: img.key,
          contentModeration: true,
          moderationLabelCount: labels.length,
          topLabel: top?.Name,
          batchScanHash: d.scanHash,
        });
        // Retain nested conv_scan cleartext for human review; API purges after report is terminal.
        await d.invokeDbWriter(
          d.primaryMediaId,
          'rejected',
          undefined,
          `content_moderation: ${labels[0]?.Name}`,
          { purpose: d.purpose, s3Key: img.key }
        );
        return;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    d.logProcessorEvent({
      event: 'rekognition_error',
      mediaId: d.primaryMediaId,
      purpose: d.purpose,
      s3Key: d.sealKey,
      rekognitionError: message,
      batchScanHash: d.scanHash,
    });
    const allToDelete = convScanKeysToDelete(keys, prefix, d.sealKey);
    await deleteKeys(d.s3, d.bucket, allToDelete);
    await d.invokeDbWriter(d.primaryMediaId, 'failed', undefined, undefined, {
      purpose: d.purpose,
      s3Key: d.sealKey,
    });
    return;
  }

  const allToDelete = convScanKeysToDelete(keys, prefix, d.sealKey);
  await deleteKeys(d.s3, d.bucket, allToDelete);
  await d.invokeDbWriter(d.primaryMediaId, 'ready', undefined, undefined, {
    purpose: d.purpose,
    s3Key: d.sealKey,
  });
}
