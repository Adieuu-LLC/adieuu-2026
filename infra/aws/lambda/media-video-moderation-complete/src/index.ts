/**
 * Rekognition StartContentModeration completion handler.
 *
 * Subscribes to SNS (topic publish permissions held by Rekognition service role).
 * On SUCCEEDED, loads moderation labels via GetContentModeration, updates via DB writer.
 * Pass: deletes scan copy from S3. Reject: retains scan copy until API purges after report closes.
 */

import type { SNSEvent } from 'aws-lambda';
import {
  RekognitionClient,
  GetContentModerationCommand,
  type ModerationLabel,
} from '@aws-sdk/client-rekognition';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const BUCKET = process.env.MEDIA_BUCKET!;
const MODERATION_CONFIDENCE = parseInt(
  process.env.MODERATION_CONFIDENCE ?? '75',
  10
);
const DB_WRITER_FUNCTION_NAME = process.env.DB_WRITER_FUNCTION_NAME!;

const rekognition = new RekognitionClient({});
const s3 = new S3Client({});
const lambda = new LambdaClient({});

interface RekognitionVideoNotification {
  JobId: string;
  Status: string;
  API?: string;
  /** Set by media-processor StartContentModeration (primary mediaId for DB writer). */
  JobTag?: string;
  Video?: {
    S3ObjectName?: string;
    S3Bucket?: string;
  };
}

function parseNotification(raw: string): RekognitionVideoNotification | null {
  try {
    return JSON.parse(raw) as RekognitionVideoNotification;
  } catch {
    return null;
  }
}

/** uploads/conv_scan/{mediaId}.ext -> mediaId */
function mediaIdFromObjectKey(key: string): string | null {
  const m = key.match(/^uploads\/conv_scan\/(.+)\.[^/.]+$/);
  return m ? m[1] ?? null : null;
}

async function invokeDbWriter(
  mediaId: string,
  status: 'ready' | 'rejected' | 'failed',
  rejectionReason?: string
): Promise<void> {
  const payload = JSON.stringify({
    mediaId,
    status,
    processedS3Key: undefined,
    rejectionReason,
  });

  await lambda.send(
    new InvokeCommand({
      FunctionName: DB_WRITER_FUNCTION_NAME,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(payload),
    })
  );
}

async function collectModerationLabels(jobId: string): Promise<ModerationLabel[]> {
  const labels: ModerationLabel[] = [];
  let nextToken: string | undefined;

  do {
    const resp = await rekognition.send(
      new GetContentModerationCommand({
        JobId: jobId,
        SortBy: 'TIMESTAMP',
        NextToken: nextToken,
      })
    );
    for (const row of resp.ModerationLabels ?? []) {
      if (row.ModerationLabel) {
        labels.push(row.ModerationLabel);
      }
    }
    nextToken = resp.NextToken;
  } while (nextToken);

  return labels;
}

function flaggedLabels(labels: ModerationLabel[]): ModerationLabel[] {
  return labels.filter(
    (l) =>
      typeof l.Confidence === 'number' && l.Confidence >= MODERATION_CONFIDENCE
  );
}

export async function handler(event: SNSEvent): Promise<void> {
  for (const rec of event.Records) {
    const body = rec.Sns.Message;
    const msg = parseNotification(body);
    if (!msg?.JobId) {
      console.error('Invalid SNS message (no JobId)', body?.slice?.(0, 200));
      continue;
    }

    if (msg.API && msg.API !== 'StartContentModeration') {
      console.log(`Skipping non-content-moderation job API=${msg.API}`);
      continue;
    }

    const bucket = msg.Video?.S3Bucket ?? BUCKET;
    const key = msg.Video?.S3ObjectName;
    if (!key) {
      console.error('Missing Video.S3ObjectName in notification');
      continue;
    }

    const mediaId =
      (msg.JobTag && msg.JobTag.length > 0 ? msg.JobTag : null) ?? mediaIdFromObjectKey(key);
    if (!mediaId) {
      console.error(`Could not parse mediaId from key/JobTag: ${key}`);
      continue;
    }

    if (msg.Status === 'ERROR' || msg.Status === 'FAILED') {
      console.warn(`Job ${msg.JobId} status=${msg.Status}`);
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (e) {
        console.warn('DeleteObject after failed job:', e);
      }
      await invokeDbWriter(mediaId, 'failed');
      continue;
    }

    if (msg.Status !== 'SUCCEEDED') {
      console.log(`Ignoring status ${msg.Status} for job ${msg.JobId}`);
      continue;
    }

    try {
      const labels = await collectModerationLabels(msg.JobId);
      const bad = flaggedLabels(labels);

      if (bad.length > 0) {
        const top = bad[0];
        // Keep conv_scan MP4 for moderator review; API purges after report is resolved/closed.
        await invokeDbWriter(
          mediaId,
          'rejected',
          `content_moderation: ${top?.Name ?? 'unknown'}`
        );
      } else {
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        } catch (delErr) {
          console.warn(`Failed to delete scan object ${key}:`, delErr);
        }
        await invokeDbWriter(mediaId, 'ready');
      }
    } catch (err) {
      console.error('GetContentModeration / writer error:', err);
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch {
        /* ignore */
      }
      await invokeDbWriter(mediaId, 'failed');
    }
  }
}
