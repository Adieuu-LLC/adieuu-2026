/**
 * Media DB writer Lambda
 *
 * Receives invocations from the media processor Lambda and updates the
 * media_uploads collection in MongoDB Atlas. Isolated from the processor
 * so that compromise of the image-processing Lambda does not expose
 * database credentials.
 *
 * Runs inside the VPC to reach Atlas via VPC peering. MongoDB connection
 * and Secrets Manager values are cached across warm invocations.
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { MongoClient, type ObjectId } from 'mongodb';
import { logModerationEvent } from './logging';

const MONGODB_SECRET_ARN = process.env.MONGODB_SECRET_ARN!;
const MONGODB_SECRET_KEY = process.env.MONGODB_SECRET_KEY || 'MONGODB_URI';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME!;
const MEDIA_CDN_URL = process.env.MEDIA_CDN_URL || '';

const MEDIA_UPLOADS_COLLECTION = 'media_uploads';
const E2E_MEDIA_COLLECTION = 'e2e_media';
const PLATFORM_REPORTS_COLLECTION = 'platform_reports';

const secretsManager = new SecretsManagerClient({});

let cachedMongoUri: string | null = null;
let cachedMongoClient: MongoClient | null = null;

interface WriterEvent {
  mediaId: string;
  status: 'ready' | 'rejected' | 'failed';
  processedS3Key?: string;
  rejectionReason?: string;
}

interface WriterResult {
  success: boolean;
  error?: string;
}

async function getMongoUri(): Promise<string> {
  if (cachedMongoUri) return cachedMongoUri;

  const result = await secretsManager.send(
    new GetSecretValueCommand({ SecretId: MONGODB_SECRET_ARN })
  );

  if (!result.SecretString) {
    throw new Error('MongoDB secret is empty');
  }

  let uri: string;
  try {
    const parsed = JSON.parse(result.SecretString);
    uri = parsed[MONGODB_SECRET_KEY];
    if (!uri) {
      throw new Error(
        `Mongo secret key not found in secret JSON`
      );
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      uri = result.SecretString;
    } else {
      throw err;
    }
  }

  cachedMongoUri = uri;
  return cachedMongoUri;
}

async function getMongoClient(): Promise<MongoClient> {
  if (cachedMongoClient) return cachedMongoClient;

  const uri = await getMongoUri();

  const maskedUri = uri.replace(
    /\/\/([^:]+):([^@]+)@/,
    '//$1:***@'
  );
  console.log(
    `Connecting to MongoDB: ${maskedUri}, database: ${MONGODB_DB_NAME}`
  );

  const client = new MongoClient(uri, {
    minPoolSize: 1,
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });

  await client.connect();

  const db = client.db(MONGODB_DB_NAME);
  const ping = await db.command({ ping: 1 });
  if (!ping.ok) {
    throw new Error(
      `MongoDB ping failed on database "${MONGODB_DB_NAME}"!`
    );
  }

  const docCount = await db
    .collection(MEDIA_UPLOADS_COLLECTION)
    .estimatedDocumentCount();
  console.log(
    `MongoDB connected and verified: database="${MONGODB_DB_NAME}", ` +
    `collection="${MEDIA_UPLOADS_COLLECTION}" (~${docCount} documents)`
  );

  cachedMongoClient = client;
  return cachedMongoClient;
}

/** Resolve Mongo ObjectId or 24-char hex string to hex identity id. */
function bsonIdentityToHexString(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') {
    return /^[a-f0-9]{24}$/i.test(v) ? v.toLowerCase() : undefined;
  }
  if (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ObjectId).toHexString === 'function'
  ) {
    return (v as ObjectId).toHexString();
  }
  return undefined;
}

export async function handler(event: WriterEvent): Promise<WriterResult> {
  const { mediaId, status, processedS3Key, rejectionReason } = event;

  if (!mediaId || !status) {
    return { success: false, error: 'Missing required fields: mediaId, status' };
  }

  console.log(
    JSON.stringify({
      source: 'media-db-writer',
      event: 'media_upload_update_start',
      mediaId,
      status,
      hasRejectionReason: rejectionReason != null,
    })
  );

  try {
    const client = await getMongoClient();
    const db = client.db(MONGODB_DB_NAME);
    const collection = db.collection(MEDIA_UPLOADS_COLLECTION);

    const cdnUrl =
      status === 'ready' && processedS3Key && MEDIA_CDN_URL
        ? `${MEDIA_CDN_URL}/${processedS3Key.replace(/^processed\//, '')}`
        : undefined;

    const updateFields: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (processedS3Key !== undefined) updateFields.processedS3Key = processedS3Key;
    if (cdnUrl !== undefined) updateFields.cdnUrl = cdnUrl;
    if (rejectionReason !== undefined) updateFields.rejectionReason = rejectionReason;

    const mediaDoc = await collection.findOneAndUpdate(
      { mediaId },
      { $set: updateFields },
      { returnDocument: 'after' }
    );

    if (!mediaDoc) {
      console.warn(`No document found for mediaId: ${mediaId}`);
      return { success: false, error: 'Upload not found' };
    }

    console.log(`Updated media upload: ${mediaId}, status: ${status}`);

    const scanHash = (mediaDoc as Record<string, unknown>).scanHash as string | undefined;
    const purpose = (mediaDoc as Record<string, unknown>).purpose as string | undefined;

    if (
      scanHash &&
      purpose === 'conv_scan' &&
      (status === 'ready' || status === 'rejected' || status === 'failed')
    ) {
      const siblingFields: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };
      if (rejectionReason !== undefined) siblingFields.rejectionReason = rejectionReason;
      const siblingRes = await collection.updateMany(
        { scanHash, purpose: 'conv_scan', mediaId: { $ne: mediaId } },
        { $set: siblingFields }
      );
      if (siblingRes.modifiedCount > 0) {
        console.log(
          `Updated ${siblingRes.modifiedCount} sibling conv_scan media_upload row(s) to status=${status}`
        );
      }
    }

    // If this is a scan copy (conv_scan), propagate moderation status to the
    // companion E2E media record via scanHash.
    if (scanHash && (status === 'ready' || status === 'rejected' || status === 'failed')) {
      const e2eCollection = db.collection(E2E_MEDIA_COLLECTION);
      const moderationStatus =
        status === 'ready' ? 'passed' :
        status === 'rejected' ? 'rejected' :
        'error';
      const e2eStatus = status === 'ready' ? 'available' : 'gated';

      const e2eUpdate: Record<string, unknown> = {
        moderationStatus,
        status: e2eStatus,
        updatedAt: new Date(),
      };
      if (rejectionReason) {
        e2eUpdate.moderationReason = rejectionReason;
      }

      const e2eResult = await e2eCollection.updateOne(
        { scanHash },
        { $set: e2eUpdate }
      );

      if (e2eResult.matchedCount > 0) {
        console.log(`Updated E2E media via scanHash: moderationStatus=${moderationStatus}`);
      } else {
        console.warn(`No E2E media document found for scanHash (may be orphaned scan copy)`);
      }
    }

    // Create an automated platform report when content is rejected
    if (status === 'rejected' && rejectionReason) {
      const scanHashForReport = (mediaDoc as Record<string, unknown>).scanHash as
        | string
        | undefined;
      const idempotencyKey = `rekog:${mediaId}`;

      try {
        const reportsCollection = db.collection(PLATFORM_REPORTS_COLLECTION);
        const existing = await reportsCollection.findOne({ idempotencyKey });
        if (existing) {
          const existingId =
            (existing as { _id?: { toHexString(): string } })._id?.toHexString?.() ??
            String((existing as { _id?: unknown })._id);
          logModerationEvent({
            event: 'automated_report_deduped',
            mediaId,
            scanHash: scanHashForReport,
            status,
            rejectionReason,
            idempotencyKey,
            reportAction: 'deduped_skip',
            reportId: existingId,
          });
        } else {
          const identityFromMedia = bsonIdentityToHexString(
            (mediaDoc as Record<string, unknown>).identityId
          );

          let targetType: string = 'media_upload';
          let targetId: string = mediaId;
          let e2eMatched = false;
          let identityFromE2e: string | undefined;

          if (scanHashForReport) {
            const e2eDoc = await db
              .collection(E2E_MEDIA_COLLECTION)
              .findOne({ scanHash: scanHashForReport });
            if (e2eDoc) {
              e2eMatched = true;
              const e2eMediaId = (e2eDoc as Record<string, unknown>).e2eMediaId as
                | string
                | undefined;
              if (e2eMediaId) {
                targetType = 'e2e_media';
                targetId = e2eMediaId;
              }
              identityFromE2e = bsonIdentityToHexString(
                (e2eDoc as Record<string, unknown>).identityId
              );
            }
          }

          const targetIdentityId = identityFromMedia ?? identityFromE2e;

          const labelName = rejectionReason.replace(/^content_moderation:\s*/i, '').trim();
          const category = labelName.toLowerCase().includes('child')
            ? 'csam'
            : labelName.toLowerCase().includes('violence')
              ? 'violence'
              : 'illegal_content';

          const now = new Date();
          const insertDoc = {
            reportType: 'content',
            source: 'automated_rekognition',
            status: 'open',
            category,
            scopeType: 'platform',
            targetRef: { type: targetType, id: targetId },
            targetIdentityId,
            detectionMetadata: {
              rejectionReason,
              mediaId,
              scanHash: scanHashForReport,
              e2eMatched,
            },
            idempotencyKey,
            createdAt: now,
            updatedAt: now,
          };

          logModerationEvent({
            event: 'automated_report_insert_attempt',
            mediaId,
            scanHash: scanHashForReport,
            status,
            rejectionReason,
            idempotencyKey,
            targetRefType: targetType,
            targetRefId: targetId,
            targetIdentityId,
            category,
            e2eMatched,
          });

          const insertResult = await reportsCollection.insertOne(insertDoc);

          const insertedId = insertResult.insertedId?.toHexString?.() ?? String(insertResult.insertedId);
          logModerationEvent({
            event: 'automated_report_created',
            mediaId,
            scanHash: scanHashForReport,
            idempotencyKey,
            reportAction: 'created',
            reportId: insertedId,
            targetRefType: targetType,
            targetRefId: targetId,
            targetIdentityId,
            category,
            e2eMatched,
          });
        }
      } catch (reportErr) {
        const err = reportErr as Error;
        logModerationEvent({
          event: 'automated_report_error',
          mediaId,
          scanHash: scanHashForReport,
          status,
          rejectionReason,
          idempotencyKey,
          reportAction: 'error',
          errorName: err.name,
          errorMessage: err.message,
        });
        console.error('Failed to create platform report (non-fatal):', reportErr);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('DB writer error:', err);
    throw err;
  }
}
