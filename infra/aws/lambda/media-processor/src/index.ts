/**
 * Media processor Lambda
 *
 * Triggered by S3 PutObject on the uploads/ prefix. Processes images:
 * 1. CSAM hash detection (MD5/SHA1 against NCMEC DynamoDB + PDQ via Arachnid Shield API)
 * 2. EXIF metadata stripping (when enabled)
 * 3. Resize and compress to WebP (when resize dimensions specified)
 * 4. Write processed file to processed/ prefix (skipped for purpose conv_scan — E2E scan copies)
 * 5. Invoke the DB writer Lambda to persist the result
 *
 * Processing flags are read from the S3 object's user metadata,
 * set by the upload service when generating presigned URLs.
 *
 * This Lambda runs OUTSIDE the VPC (needs only public S3 + DynamoDB + Arachnid HTTPS).
 * Database access is isolated to the DB writer Lambda for security.
 *
 * Conv_scan uses the sealed-batch path (`convScanBatch.ts`, nested
 * `uploads/conv_scan/{scanHash}/` + `.sealed`). Flat `conv_scan` video keys are rejected below.
 */

import type { S3Event, S3EventRecord, SQSEvent } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { logProcessorEvent } from './logging';
import {
  shouldDeferNestedConvScanObject,
  isConvScanSealObjectKey,
  parseNestedConvScanScanHashFromKey,
  processConvScanSealBatch,
} from './convScanBatch';
import { checkNcmecHashes, checkArachnidShield } from './csam-hash-check';
import type { CsamMatch } from './csam-types';

const s3 = new S3Client({});
const dynamodb = new DynamoDBClient({});
const secretsManager = new SecretsManagerClient({});
const lambda = new LambdaClient({});

const BUCKET = process.env.MEDIA_BUCKET!;
const DB_WRITER_FUNCTION_NAME = process.env.DB_WRITER_FUNCTION_NAME!;
const NCMEC_HASH_TABLE = process.env.NCMEC_HASH_TABLE ?? '';
const ARACHNID_SECRET_ARN = process.env.ARACHNID_SECRET_ARN ?? '';
const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET ?? '';

let cachedArachnidCredentials: { username: string; password: string } | null = null;

async function getArachnidCredentials(): Promise<{ username: string; password: string } | null> {
  if (!ARACHNID_SECRET_ARN) return null;
  if (cachedArachnidCredentials) return cachedArachnidCredentials;

  const result = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: ARACHNID_SECRET_ARN })
  );
  if (!result.SecretString) return null;
  const parsed = JSON.parse(result.SecretString) as { username?: string; password?: string };
  if (!parsed.username || !parsed.password) return null;
  cachedArachnidCredentials = { username: parsed.username, password: parsed.password };
  return cachedArachnidCredentials;
}

interface ProcessingMetadata {
  mediaId: string;
  purpose: string;
  identityId: string;
  stripExif: boolean;
  contentModeration: boolean;
  resizeMaxWidth?: number;
  resizeMaxHeight?: number;
}

function parseMetadata(
  metadata: Record<string, string> | undefined
): ProcessingMetadata | null {
  if (!metadata) return null;

  const mediaId = metadata['media-id'];
  const purpose = metadata['purpose'];
  const identityId = metadata['identity-id'];

  if (!mediaId || !purpose || !identityId) return null;

  return {
    mediaId,
    purpose,
    identityId,
    stripExif: metadata['strip-exif'] === 'true',
    contentModeration: metadata['content-moderation'] === 'true',
    resizeMaxWidth: metadata['resize-max-width']
      ? parseInt(metadata['resize-max-width'], 10)
      : undefined,
    resizeMaxHeight: metadata['resize-max-height']
      ? parseInt(metadata['resize-max-height'], 10)
      : undefined,
  };
}

interface DbWriterPayload {
  mediaId: string;
  status: 'ready' | 'rejected' | 'failed';
  processedS3Key?: string;
  rejectionReason?: string;
  csamMatches?: CsamMatch[];
  evidenceBucket?: string;
  evidenceKey?: string;
}

async function invokeDbWriter(
  mediaId: string,
  status: 'ready' | 'rejected' | 'failed',
  processedS3Key?: string,
  rejectionReason?: string,
  context?: { purpose?: string; s3Key?: string },
  csamFields?: { csamMatches?: CsamMatch[]; evidenceBucket?: string; evidenceKey?: string }
): Promise<void> {
  const payload = JSON.stringify({
    mediaId,
    status,
    processedS3Key,
    rejectionReason,
    ...csamFields,
  } satisfies DbWriterPayload);

  logProcessorEvent({
    event: 'db_writer_invoke_start',
    mediaId,
    purpose: context?.purpose,
    s3Key: context?.s3Key,
    dbWriterStatus: status,
  });

  try {
    const result = await lambda.send(
      new InvokeCommand({
        FunctionName: DB_WRITER_FUNCTION_NAME,
        InvocationType: 'RequestResponse',
        Payload: new TextEncoder().encode(payload),
      })
    );

    if (result.FunctionError) {
      const responsePayload = result.Payload
        ? new TextDecoder().decode(result.Payload)
        : 'no payload';
      logProcessorEvent({
        event: 'db_writer_invoke_lambda_error',
        mediaId,
        purpose: context?.purpose,
        dbWriterStatus: status,
        dbWriterFunctionError: result.FunctionError,
      });
      console.error(
        `DB writer invocation error (${result.FunctionError}): ${responsePayload}`
      );
    } else {
      logProcessorEvent({
        event: 'db_writer_invoke_ok',
        mediaId,
        purpose: context?.purpose,
        dbWriterStatus: status,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logProcessorEvent({
      event: 'db_writer_invoke_failed',
      mediaId,
      purpose: context?.purpose,
      dbWriterStatus: status,
      dbWriterInvokeError: message,
    });
    console.error('DB writer invocation failed:', err);
  }
}

/**
 * Run all available CSAM hash checks against the image bytes.
 * Returns all matches found — the DB writer decides which to act on.
 */
async function runCsamHashChecks(
  imageBytes: Uint8Array,
  mediaId: string,
  key: string,
): Promise<CsamMatch[]> {
  const allMatches: CsamMatch[] = [];

  if (NCMEC_HASH_TABLE) {
    try {
      const ncmecMatches = await checkNcmecHashes(imageBytes, NCMEC_HASH_TABLE, dynamodb);
      allMatches.push(...ncmecMatches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logProcessorEvent({ event: 'ncmec_hash_check_error', mediaId, s3Key: key, error: message });
      console.error('NCMEC hash check error:', err);
    }
  }

  const arachnidCreds = await getArachnidCredentials();
  if (arachnidCreds) {
    try {
      const arachnidMatches = await checkArachnidShield(imageBytes, arachnidCreds);
      allMatches.push(...arachnidMatches);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logProcessorEvent({ event: 'arachnid_hash_check_error', mediaId, s3Key: key, error: message });
      console.error('Arachnid Shield hash check error:', err);
    }
  }

  return allMatches;
}

/**
 * On CSAM match: copy evidence to isolated bucket, invoke DB writer with match data.
 */
async function handleCsamMatch(
  bucket: string,
  key: string,
  meta: ProcessingMetadata,
  imageBytes: Uint8Array,
  matches: CsamMatch[],
): Promise<void> {
  let evidenceKey: string | undefined;

  if (EVIDENCE_BUCKET) {
    evidenceKey = `csam-evidence/${meta.mediaId}/${key.split('/').pop() ?? 'file'}`;
    try {
      await s3.send(new CopyObjectCommand({
        CopySource: `${bucket}/${key}`,
        Bucket: EVIDENCE_BUCKET,
        Key: evidenceKey,
        Metadata: {
          'detection-source': matches[0]?.source ?? 'unknown',
          'matched-hash': matches[0]?.matchedHash ?? '',
          'matched-hash-type': matches[0]?.hashType ?? '',
          'match-type': matches[0]?.matchType ?? '',
          'identity-id': meta.identityId,
          'media-id': meta.mediaId,
          'detection-timestamp': new Date().toISOString(),
        },
        MetadataDirective: 'REPLACE',
      }));
      logProcessorEvent({
        event: 'csam_evidence_archived',
        mediaId: meta.mediaId,
        s3Key: key,
        evidenceBucket: EVIDENCE_BUCKET,
        evidenceKey,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logProcessorEvent({ event: 'csam_evidence_archive_error', mediaId: meta.mediaId, s3Key: key, error: message });
      console.error('Failed to archive CSAM evidence:', err);
    }
  }

  if (meta.purpose !== 'conv_scan') {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    } catch {
      /* best-effort */
    }
  }

  await invokeDbWriter(
    meta.mediaId,
    'rejected',
    undefined,
    `csam_hash_match: ${matches[0]?.source}:${matches[0]?.hashType}`,
    { purpose: meta.purpose, s3Key: key },
    { csamMatches: matches, evidenceBucket: EVIDENCE_BUCKET || undefined, evidenceKey },
  );
}

async function processRecord(record: S3EventRecord): Promise<void> {
  const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

  if (!key.startsWith('uploads/')) {
    console.log(`Skipping non-upload key: ${key}`);
    return;
  }

  console.log(`Processing: ${key}`);

  const headResult = await s3.send(
    new HeadObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const meta = parseMetadata(headResult.Metadata);

  if (!meta) {
    console.error(`Missing metadata on ${key}, skipping`);
    return;
  }

  if (shouldDeferNestedConvScanObject(key, meta.purpose)) {
    console.log(`Nested conv_scan payload; awaiting .sealed: ${key}`);
    return;
  }

  const nestedScanHash = parseNestedConvScanScanHashFromKey(key);
  if (
    meta.purpose === 'conv_scan' &&
    isConvScanSealObjectKey(key) &&
    nestedScanHash
  ) {
    await processConvScanSealBatch({
      bucket: BUCKET,
      sealKey: key,
      scanHash: nestedScanHash,
      primaryMediaId: meta.mediaId,
      purpose: meta.purpose,
      identityId: meta.identityId,
      stripExif: meta.stripExif,
      contentModeration: meta.contentModeration,
      s3,
      invokeDbWriter,
      logProcessorEvent,
      runCsamHashChecks,
      handleCsamMatch,
    });
    return;
  }

  console.log(`Media ID: ${meta.mediaId}, Purpose: ${meta.purpose}`);

  const contentType = headResult.ContentType ?? '';
  const isVideo = contentType.startsWith('video/');

  if (isVideo && meta.purpose !== 'conv_scan') {
    console.error(`Unexpected video object for purpose ${meta.purpose}: ${key}`);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    await invokeDbWriter(meta.mediaId, 'failed', undefined, undefined, {
      purpose: meta.purpose,
      s3Key: key,
    });
    return;
  }

  // Flat conv_scan video (non-nested layout): never processed on this path. Valid uploads use
  // `uploads/conv_scan/{scanHash}/` payloads plus `.sealed` (see convScanBatch); optional MP4 there only.
  if (meta.purpose === 'conv_scan' && isVideo) {
    logProcessorEvent({
      event: 'conv_scan_flat_video_rejected',
      mediaId: meta.mediaId,
      purpose: meta.purpose,
      s3Key: key,
    });
    console.warn(`conv_scan video at non-nested path not supported: ${key}`);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      /* best-effort */
    }
    await invokeDbWriter(meta.mediaId, 'failed', undefined, 'conv_scan_flat_video_not_supported', {
      purpose: meta.purpose,
      s3Key: key,
    });
    return;
  }

  if (meta.contentModeration && !isVideo) {
    console.log('Running CSAM hash checks...');
    try {
      const rawObj = await s3.send(
        new GetObjectCommand({ Bucket: BUCKET, Key: key })
      );
      const rawBytes = await rawObj.Body!.transformToByteArray();
      const csamMatches = await runCsamHashChecks(rawBytes, meta.mediaId, key);

      if (csamMatches.length > 0) {
        const sources = csamMatches.map(m => `${m.source}:${m.hashType}`).join(', ');
        logProcessorEvent({
          event: 'csam_hash_match_detected',
          mediaId: meta.mediaId,
          purpose: meta.purpose,
          s3Key: key,
          matchCount: csamMatches.length,
          matchSources: sources,
        });
        console.warn(`CSAM hash match detected: ${sources}`);

        await handleCsamMatch(BUCKET, key, meta, rawBytes, csamMatches);
        return;
      }

      console.log('CSAM hash checks passed (no matches)');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logProcessorEvent({
        event: 'csam_hash_check_fatal',
        mediaId: meta.mediaId,
        purpose: meta.purpose,
        s3Key: key,
        error: message,
      });
      console.error('CSAM hash check fatal error:', err);
      await invokeDbWriter(meta.mediaId, 'failed', undefined, undefined, {
        purpose: meta.purpose,
        s3Key: key,
      });
      return;
    }
  }

  if (meta.purpose === 'conv_scan') {
    console.log('conv_scan: deleting raw upload; marking ready without processed asset');
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (delErr) {
      console.warn(`Failed to delete conv_scan raw upload: ${key}`, delErr);
    }
    await invokeDbWriter(meta.mediaId, 'ready', undefined, undefined, {
      purpose: meta.purpose,
      s3Key: key,
    });
    console.log(`Completed conv_scan (no processed/): ${meta.mediaId}`);
    return;
  }

  const getResult = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const bodyBytes = await getResult.Body!.transformToByteArray();

  let processedBuffer: Uint8Array;
  const isAnimatedGif =
    meta.purpose === 'custom_emoji' &&
    (getResult.ContentType === 'image/gif' || key.endsWith('.gif'));
  let outputContentType = isAnimatedGif ? 'image/gif' : 'image/webp';

  try {
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(bodyBytes, isAnimatedGif ? { animated: true } : undefined);

    if (meta.stripExif) {
      pipeline = pipeline.rotate();
    }

    if (meta.resizeMaxWidth || meta.resizeMaxHeight) {
      pipeline = pipeline.resize({
        width: meta.resizeMaxWidth,
        height: meta.resizeMaxHeight,
        fit: 'inside',
        withoutEnlargement: meta.purpose !== 'custom_emoji',
      });
    }

    if (isAnimatedGif) {
      processedBuffer = await pipeline.gif().toBuffer();
    } else {
      const webpQuality = meta.purpose === 'custom_emoji' ? 95 : 85;
      processedBuffer = await pipeline.webp({ quality: webpQuality }).toBuffer();
    }

    console.log(
      `Processed: ${bodyBytes.length} -> ${processedBuffer.length} bytes`
    );
  } catch (err) {
    console.error('Image processing error:', err);
    await invokeDbWriter(meta.mediaId, 'failed', undefined, undefined, {
      purpose: meta.purpose,
      s3Key: key,
    });
    return;
  }

  const outputExtension = isAnimatedGif ? '.gif' : '.webp';
  const processedKey = key
    .replace(/^uploads\//, 'processed/')
    .replace(/\.[^.]+$/, outputExtension);

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: processedKey,
        Body: processedBuffer,
        ContentType: outputContentType,
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );

    console.log(`Uploaded processed file: ${processedKey}`);
  } catch (err) {
    console.error('Failed to upload processed file:', err);
    await invokeDbWriter(meta.mediaId, 'failed', undefined, undefined, {
      purpose: meta.purpose,
      s3Key: key,
    });
    return;
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    console.warn(`Failed to delete raw upload: ${key}`);
  }

  await invokeDbWriter(meta.mediaId, 'ready', processedKey, undefined, {
    purpose: meta.purpose,
    s3Key: key,
  });
  console.log(`Completed processing: ${meta.mediaId}`);
}

export async function handler(event: SQSEvent): Promise<void> {
  console.log(`Processing ${event.Records.length} SQS message(s)`);

  for (const sqsRecord of event.Records) {
    const body = JSON.parse(sqsRecord.body);

    if (!body.Records || !Array.isArray(body.Records)) {
      console.log('Skipping non-S3 event message (e.g. s3:TestEvent)');
      continue;
    }

    const s3Event = body as S3Event;

    for (const record of s3Event.Records) {
      try {
        await processRecord(record);
      } catch (err) {
        const key = record?.s3?.object?.key ?? 'unknown';
        console.error(`Error processing record ${key}:`, err);
      }
    }
  }
}
