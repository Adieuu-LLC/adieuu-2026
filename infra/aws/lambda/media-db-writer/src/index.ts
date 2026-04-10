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
import { MongoClient } from 'mongodb';

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

export async function handler(event: WriterEvent): Promise<WriterResult> {
  const { mediaId, status, processedS3Key, rejectionReason } = event;

  if (!mediaId || !status) {
    return { success: false, error: 'Missing required fields: mediaId, status' };
  }

  console.log(`Updating media upload: ${mediaId} -> ${status}`);

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

    // If this is a scan copy (conv_scan), propagate moderation status to the
    // companion E2E media record via scanHash.
    const scanHash = (mediaDoc as Record<string, unknown>).scanHash as string | undefined;
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
      try {
        const reportsCollection = db.collection(PLATFORM_REPORTS_COLLECTION);
        const idempotencyKey = `rekog:${mediaId}`;
        const existing = await reportsCollection.findOne({ idempotencyKey });
        if (!existing) {
          const identityId =
            (mediaDoc as Record<string, unknown>).identityId as string | undefined;
          const scanHash =
            (mediaDoc as Record<string, unknown>).scanHash as string | undefined;

          let targetType: string = 'media_upload';
          let targetId: string = mediaId;
          if (scanHash) {
            const e2eDoc = await db.collection(E2E_MEDIA_COLLECTION).findOne({ scanHash });
            if (e2eDoc) {
              targetType = 'e2e_media';
              targetId = (e2eDoc._id as { toHexString(): string }).toHexString();
            }
          }

          const labelName = rejectionReason.replace('content_moderation: ', '');
          const category = labelName.toLowerCase().includes('child')
            ? 'csam'
            : labelName.toLowerCase().includes('violence')
              ? 'violence'
              : 'illegal_content';

          const now = new Date();
          await reportsCollection.insertOne({
            reportType: 'content',
            source: 'automated_rekognition',
            status: 'open',
            category,
            scopeType: 'platform',
            targetRef: { type: targetType, id: targetId },
            targetIdentityId: identityId ?? undefined,
            detectionMetadata: { rejectionReason, mediaId, scanHash },
            idempotencyKey,
            createdAt: now,
            updatedAt: now,
          });

          console.log(`Created platform report for rejected media: ${mediaId}`);
        }
      } catch (reportErr) {
        console.error('Failed to create platform report (non-fatal):', reportErr);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('DB writer error:', err);
    throw err;
  }
}
