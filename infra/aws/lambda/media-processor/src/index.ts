/**
 * Media processor Lambda
 *
 * Triggered by S3 PutObject on the uploads/ prefix. Processes images:
 * 1. Content moderation via Amazon Rekognition (when enabled)
 * 2. EXIF metadata stripping (when enabled)
 * 3. Resize and compress to WebP (when resize dimensions specified)
 * 4. Write processed file to processed/ prefix
 * 5. Invoke the DB writer Lambda to persist the result
 *
 * Processing flags are read from the S3 object's user metadata,
 * set by the upload service when generating presigned URLs.
 *
 * This Lambda runs OUTSIDE the VPC (needs only public S3 + Rekognition).
 * Database access is isolated to the DB writer Lambda for security.
 *
 * TODO [VIDEO SUPPORT]: When adding video moderation, this Lambda will need:
 * - ffmpeg layer for frame extraction / transcoding
 * - Async Rekognition pipeline: StartContentModeration -> SNS topic -> callback handler
 * - The callback handler should update the DB via the DB writer Lambda
 * - See AsyncModerationResult in apps/api/src/models/e2e-media.ts for the type definitions
 * - VIDEO_MIME_TYPES in apps/api/src/models/media-upload.ts lists the accepted types
 */

import type { S3Event, S3EventRecord, SQSEvent } from 'aws-lambda';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import {
  RekognitionClient,
  DetectModerationLabelsCommand,
} from '@aws-sdk/client-rekognition';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});
const lambda = new LambdaClient({});

const BUCKET = process.env.MEDIA_BUCKET!;
const CONTENT_MODERATION = process.env.CONTENT_MODERATION === 'true';
const MODERATION_CONFIDENCE = parseInt(
  process.env.MODERATION_CONFIDENCE ?? '75',
  10
);
const DB_WRITER_FUNCTION_NAME = process.env.DB_WRITER_FUNCTION_NAME!;

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

async function invokeDbWriter(
  mediaId: string,
  status: 'ready' | 'rejected' | 'failed',
  processedS3Key?: string,
  rejectionReason?: string
): Promise<void> {
  const payload = JSON.stringify({
    mediaId,
    status,
    processedS3Key,
    rejectionReason,
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
      console.error(
        `DB writer invocation error (${result.FunctionError}): ${responsePayload}`
      );
    }
  } catch (err) {
    console.error('DB writer invocation failed:', err);
  }
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

  console.log(`Media ID: ${meta.mediaId}, Purpose: ${meta.purpose}`);

  if (CONTENT_MODERATION && meta.contentModeration) {
    // TODO [VIDEO SUPPORT]: For video files, use StartContentModeration (async)
    // instead of DetectModerationLabels (sync). Requires an SNS topic for
    // the callback and a separate handler to process the async result.
    console.log('Running content moderation...');
    try {
      const moderationResult = await rekognition.send(
        new DetectModerationLabelsCommand({
          Image: {
            S3Object: {
              Bucket: BUCKET,
              Name: key,
            },
          },
          MinConfidence: MODERATION_CONFIDENCE,
        })
      );

      const labels = moderationResult.ModerationLabels ?? [];
      if (labels.length > 0) {
        const labelNames = labels
          .map((l) => `${l.Name} (${l.Confidence?.toFixed(1)}%)`)
          .join(', ');
        console.warn(`Content moderation flagged: ${labelNames}`);

        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));

        await invokeDbWriter(
          meta.mediaId,
          'rejected',
          undefined,
          `content_moderation: ${labels[0]?.Name}`
        );
        return;
      }

      console.log('Content moderation passed');
    } catch (err) {
      console.error('Rekognition error:', err);
      await invokeDbWriter(meta.mediaId, 'failed');
      return;
    }
  }

  const getResult = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const bodyBytes = await getResult.Body!.transformToByteArray();

  let processedBuffer: Uint8Array;
  let outputContentType = 'image/webp';

  try {
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(bodyBytes);

    if (meta.stripExif) {
      pipeline = pipeline.rotate();
    }

    if (meta.resizeMaxWidth || meta.resizeMaxHeight) {
      pipeline = pipeline.resize({
        width: meta.resizeMaxWidth,
        height: meta.resizeMaxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    processedBuffer = await pipeline
      .webp({ quality: 85 })
      .toBuffer();

    console.log(
      `Processed: ${bodyBytes.length} -> ${processedBuffer.length} bytes`
    );
  } catch (err) {
    console.error('Image processing error:', err);
    await invokeDbWriter(meta.mediaId, 'failed');
    return;
  }

  const processedKey = key
    .replace(/^uploads\//, 'processed/')
    .replace(/\.[^.]+$/, '.webp');

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
    await invokeDbWriter(meta.mediaId, 'failed');
    return;
  }

  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    console.warn(`Failed to delete raw upload: ${key}`);
  }

  await invokeDbWriter(meta.mediaId, 'ready', processedKey);
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
