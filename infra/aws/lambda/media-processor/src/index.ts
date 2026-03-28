/**
 * Media processor Lambda
 *
 * Triggered by S3 PutObject on the uploads/ prefix. Processes images:
 * 1. Content moderation via Amazon Rekognition (when enabled)
 * 2. EXIF metadata stripping (when enabled)
 * 3. Resize and compress to WebP (when resize dimensions specified)
 * 4. Write processed file to processed/ prefix
 * 5. Callback to API with result
 *
 * Processing flags are read from the S3 object's user metadata,
 * set by the upload service when generating presigned URLs.
 */

import type { S3Event, S3EventRecord } from 'aws-lambda';
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

const s3 = new S3Client({});
const rekognition = new RekognitionClient({});

const BUCKET = process.env.MEDIA_BUCKET!;
const CONTENT_MODERATION = process.env.CONTENT_MODERATION === 'true';
const MODERATION_CONFIDENCE = parseInt(
  process.env.MODERATION_CONFIDENCE ?? '75',
  10
);
const API_CALLBACK_URL = process.env.API_CALLBACK_URL!;
const PROCESSOR_SECRET = process.env.PROCESSOR_SECRET!;

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

async function notifyApi(
  mediaId: string,
  status: 'ready' | 'rejected' | 'failed',
  processedS3Key?: string,
  rejectionReason?: string
): Promise<void> {
  try {
    const response = await fetch(API_CALLBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-processor-secret': PROCESSOR_SECRET,
      },
      body: JSON.stringify({
        mediaId,
        status,
        processedS3Key,
        rejectionReason,
      }),
    });

    if (!response.ok) {
      console.error(
        `API callback failed: ${response.status} ${await response.text()}`
      );
    }
  } catch (err) {
    console.error('API callback error:', err);
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

  // Step 1: Content moderation
  if (CONTENT_MODERATION && meta.contentModeration) {
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

        await notifyApi(
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
      await notifyApi(meta.mediaId, 'failed');
      return;
    }
  }

  // Step 2: Download the file
  const getResult = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const bodyBytes = await getResult.Body!.transformToByteArray();

  // Step 3: Process with sharp (EXIF strip + resize)
  let processedBuffer: Uint8Array;
  let outputContentType = 'image/webp';

  try {
    // Dynamic import for sharp (Lambda layer or bundled)
    const sharp = (await import('sharp')).default;
    let pipeline = sharp(bodyBytes);

    if (meta.stripExif) {
      pipeline = pipeline.rotate(); // auto-rotate from EXIF then strip
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
    await notifyApi(meta.mediaId, 'failed');
    return;
  }

  // Step 4: Upload processed file
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
    await notifyApi(meta.mediaId, 'failed');
    return;
  }

  // Step 5: Clean up raw upload
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    console.warn(`Failed to delete raw upload: ${key}`);
  }

  // Step 6: Notify API
  await notifyApi(meta.mediaId, 'ready', processedKey);
  console.log(`Completed processing: ${meta.mediaId}`);
}

export async function handler(event: S3Event): Promise<void> {
  console.log(`Processing ${event.Records.length} record(s)`);

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (err) {
      console.error(
        `Error processing record ${record.s3.object.key}:`,
        err
      );
    }
  }
}
