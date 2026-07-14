/**
 * MongoDB Connection Module for Chat Service
 *
 * Provides read-only access to identity sessions for authentication validation.
 * The chat service does not write to MongoDB directly - it only validates sessions.
 */

import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { config } from '../config';
import logger from '../utils/logger';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Unified session document — the chat service only cares about
 * identity-type sessions for WebSocket authentication.
 */
export interface SessionDocument {
  _id: ObjectId;
  sessionId: string;
  type: 'account' | 'identity';
  identityId?: ObjectId;
  expiresAt: Date;
  lastActivityAt: Date;
  revoked: boolean;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Connects to MongoDB
 */
export async function connectMongo(): Promise<void> {
  if (client && db) {
    return;
  }

  client = new MongoClient(config.mongodb.uri, {
    minPoolSize: config.mongodb.minPoolSize,
    maxPoolSize: config.mongodb.maxPoolSize,
  });

  await client.connect();
  db = client.db(config.mongodb.dbName);
  logger.info('Connected to MongoDB');
}

/**
 * Gets the database instance
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

/**
 * Gets the unified sessions collection
 */
export function getSessionsCollection(): Collection<SessionDocument> {
  return getDb().collection<SessionDocument>('sessions');
}

/**
 * Space membership document — the chat service only reads (spaceId, identityId,
 * status) to resolve which Space channels a connection should subscribe to.
 */
export interface SpaceMemberDocument {
  _id: ObjectId;
  spaceId: ObjectId;
  identityId: ObjectId;
  status: 'active' | 'banned';
}

/** Gets the space members collection (read-only for subscription resolution). */
export function getSpaceMembersCollection(): Collection<SpaceMemberDocument> {
  return getDb().collection<SpaceMemberDocument>('space_members');
}

/**
 * Resolves the Space ids an identity is an active member of, so a new
 * connection can subscribe to the matching `space:{spaceId}` channels.
 * Best-effort: on any error it returns an empty list (Space realtime degrades
 * to none rather than breaking the connection).
 */
export async function findActiveSpaceIdsForIdentity(identityId: string): Promise<string[]> {
  let identityObjId: ObjectId;
  try {
    identityObjId = new ObjectId(identityId);
  } catch {
    return [];
  }

  try {
    const members = await getSpaceMembersCollection()
      .find({ identityId: identityObjId, status: 'active' }, { projection: { spaceId: 1 } })
      .toArray();
    return members.map((m) => m.spaceId.toHexString());
  } catch (error) {
    logger.warn('Failed to resolve Space memberships for identity', { error });
    return [];
  }
}

/**
 * Health check for MongoDB
 */
export interface MongoHealthResult {
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}

export async function checkMongoHealth(): Promise<MongoHealthResult> {
  if (!db) {
    return { status: 'down', error: 'Not connected' };
  }

  try {
    const start = performance.now();
    await db.command({ ping: 1 });
    const latencyMs = Math.round(performance.now() - start);
    return { status: 'up', latencyMs };
  } catch (error) {
    return {
      status: 'down',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gracefully disconnects from MongoDB
 */
export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    logger.info('Disconnected from MongoDB');
  }
}
