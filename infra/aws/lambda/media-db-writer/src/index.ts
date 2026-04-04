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

const COLLECTION_NAME = 'media_uploads';

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
        `Key "${MONGODB_SECRET_KEY}" not found in secret JSON`
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
  cachedMongoClient = new MongoClient(uri, {
    minPoolSize: 1,
    maxPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 10000,
  });

  await cachedMongoClient.connect();
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
    const collection = db.collection(COLLECTION_NAME);

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

    const result = await collection.updateOne(
      { mediaId },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      console.warn(`No document found for mediaId: ${mediaId}`);
      return { success: false, error: 'Upload not found' };
    }

    console.log(`Updated media upload: ${mediaId}, status: ${status}`);
    return { success: true };
  } catch (err) {
    console.error('DB writer error:', err);
    throw err;
  }
}
