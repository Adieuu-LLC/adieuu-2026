/**
 * Media processor Lambda
 *
 * Triggered by S3 PutObject on the uploads/ prefix. Processes images:
 * 1. Content moderation via Amazon Rekognition (when enabled). GIF inputs use the first frame
 *    as JPEG — Rekognition image APIs do not accept animated GIF.
 * 2. EXIF metadata stripping (when enabled)
 * 3. Resize and compress to WebP (when resize dimensions specified)
 * 4. Write processed file to processed/ prefix (skipped for purpose conv_scan — E2E scan copies)
 * 5. Invoke the DB writer Lambda to persist the result
 *
 * Processing flags are read from the S3 object's user metadata,
 * set by the upload service when generating presigned URLs.
 *
 * This Lambda runs OUTSIDE the VPC (needs only public S3 + Rekognition).
 * Database access is isolated to the DB writer Lambda for security.
 *
 * Full-MP4 conv_scan moderation runs only in the sealed-batch path (`convScanBatch.ts`, nested
 * `uploads/conv_scan/{scanHash}/` + `.sealed`), when enabled. Flat `conv_scan` video keys are rejected below.
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
  StartContentModerationCommand,
} from '@aws-sdk/client-rekognition';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { logProcessorEvent } from './logging';
import {
  shouldDeferNestedConvScanObject,
  isConvScanSealObjectKey,
  parseNestedConvScanScanHashFromKey,
  processConvScanSealBatch,
} from './convScanBatch';
import { gifFirstFrameJpegForModeration, isGifImage } from './gif-moderation';

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
const REKOGNITION_NOTIFICATION_ROLE_ARN =
  process.env.REKOGNITION_NOTIFICATION_ROLE_ARN ?? '';
const REKOGNITION_NOTIFICATION_SNS_TOPIC_ARN =
  process.env.REKOGNITION_NOTIFICATION_SNS_TOPIC_ARN ?? '';

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
  rejectionReason?: string,
  context?: { purpose?: string; s3Key?: string }
): Promise<void> {
  const payload = JSON.stringify({
    mediaId,
    status,
    processedS3Key,
    rejectionReason,
  });

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

async function startConvScanVideoContentModeration(
  key: string,
  meta: ProcessingMetadata,
): Promise<void> {
  if (!REKOGNITION_NOTIFICATION_ROLE_ARN || !REKOGNITION_NOTIFICATION_SNS_TOPIC_ARN) {
    console.error(
      'conv_scan video: missing REKOGNITION_NOTIFICATION_ROLE_ARN or REKOGNITION_NOTIFICATION_SNS_TOPIC_ARN'
    );
    await invokeDbWriter(
      meta.mediaId,
      'failed',
      undefined,
      undefined,
      { purpose: meta.purpose, s3Key: key }
    );
    return;
  }

  try {
    const out = await rekognition.send(
      new StartContentModerationCommand({
        Video: {
          S3Object: { Bucket: BUCKET, Name: key },
        },
        MinConfidence: MODERATION_CONFIDENCE,
        NotificationChannel: {
          RoleArn: REKOGNITION_NOTIFICATION_ROLE_ARN,
          SNSTopicArn: REKOGNITION_NOTIFICATION_SNS_TOPIC_ARN,
        },
        JobTag: meta.mediaId,
        ClientRequestToken: `${meta.mediaId}-${Date.now()}`,
      })
    );
    console.log(
      `StartContentModeration queued for conv_scan video ${meta.mediaId}, jobId=${out.JobId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logProcessorEvent({
      event: 'rekognition_start_content_moderation_error',
      mediaId: meta.mediaId,
      purpose: meta.purpose,
      s3Key: key,
      error: message,
    });
    console.error('StartContentModeration failed:', err);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch {
      /* ignore */
    }
    await invokeDbWriter(meta.mediaId, 'failed', undefined, undefined, {
      purpose: meta.purpose,
      s3Key: key,
    });
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
      moderationConfidence: MODERATION_CONFIDENCE,
      s3,
      rekognition,
      invokeDbWriter,
      logProcessorEvent,
      startConvScanVideoContentModeration,
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

  if (CONTENT_MODERATION && meta.contentModeration && !isVideo) {
    console.log('Running image content moderation...');
    try {
      let moderationResult;
      if (isGifImage(contentType, key)) {
        const gifObj = await s3.send(
          new GetObjectCommand({ Bucket: BUCKET, Key: key })
        );
        const gifBody = await gifObj.Body!.transformToByteArray();
        const jpegBytes = await gifFirstFrameJpegForModeration(gifBody);
        logProcessorEvent({
          event: 'rekognition_gif_first_frame_moderation',
          mediaId: meta.mediaId,
          purpose: meta.purpose,
          s3Key: key,
        });
        moderationResult = await rekognition.send(
          new DetectModerationLabelsCommand({
            Image: { Bytes: jpegBytes },
            MinConfidence: MODERATION_CONFIDENCE,
          })
        );
      } else {
        moderationResult = await rekognition.send(
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
      }

      const labels = moderationResult.ModerationLabels ?? [];
      if (labels.length > 0) {
        const labelNames = labels
          .map((l) => `${l.Name} (${l.Confidence?.toFixed(1)}%)`)
          .join(', ');
        console.warn(`Content moderation flagged: ${labelNames}`);

        const top = labels[0];
        logProcessorEvent({
          event: 'rekognition_moderation_flagged',
          mediaId: meta.mediaId,
          purpose: meta.purpose,
          s3Key: key,
          contentModeration: true,
          moderationLabelCount: labels.length,
          topLabel: top?.Name,
        });

        // conv_scan: retain cleartext until moderators close the report (API purge).
        if (meta.purpose !== 'conv_scan') {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
        }

        await invokeDbWriter(
          meta.mediaId,
          'rejected',
          undefined,
          `content_moderation: ${labels[0]?.Name}`,
          { purpose: meta.purpose, s3Key: key }
        );
        return;
      }

      console.log('Content moderation passed');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logProcessorEvent({
        event: 'rekognition_error',
        mediaId: meta.mediaId,
        purpose: meta.purpose,
        s3Key: key,
        rekognitionError: message,
      });
      console.error('Rekognition error:', err);
      await invokeDbWriter(meta.mediaId, 'failed', undefined, undefined, {
        purpose: meta.purpose,
        s3Key: key,
      });
      return;
    }
  }

  // E2E scan copies (conv_scan): cleartext thumbnail exists only for Rekognition.
  // Do not write to processed/; delete the raw object and mark media_uploads ready
  // without a CDN asset (E2E ciphertext lives in the separate E2E bucket).
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
