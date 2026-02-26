/**
 * MongoDB Connection Module
 * 
 * Provides connection management, typed collection access, and health checking
 * for MongoDB. Uses connection pooling for optimal performance in production.
 * 
 * Features:
 * - Singleton connection pattern (safe to call connect multiple times)
 * - Configurable connection pool sizing
 * - Health check endpoint support
 * - Typed collection access
 * - Graceful disconnection
 * 
 * @module db/mongo
 * 
 * @example
 * ```typescript
 * import { connectMongo, getDb, getCollection, Collections } from './db';
 * 
 * // Connect at startup
 * await connectMongo();
 * 
 * // Access a typed collection
 * const users = getCollection<UserDocument>(Collections.USERS);
 * const user = await users.findOne({ email: 'user@example.com' });
 * 
 * // Health check
 * const health = await checkMongoHealth();
 * console.log(health.status, health.latencyMs);
 * ```
 */

import { MongoClient, Db, Collection, Document, ClientSession, TransactionOptions } from 'mongodb';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/** Singleton MongoDB client instance */
let client: MongoClient | null = null;

/** Singleton database instance */
let db: Db | null = null;

/**
 * MongoDB connection options.
 * 
 * Configured for production use with connection pooling and reasonable timeouts.
 * Pool sizes are configurable via environment variables.
 * 
 * @internal
 */
const connectionOptions = {
  /** Minimum connections to maintain in the pool */
  minPoolSize: config.mongodb.minPoolSize,
  /** Maximum connections allowed in the pool */
  maxPoolSize: config.mongodb.maxPoolSize,
  /** Time to wait for server selection before failing (ms) */
  serverSelectionTimeoutMS: 5000,
  /** Time to wait for socket operations before timing out (ms) */
  socketTimeoutMS: 45000,
};

/**
 * Establishes a connection to MongoDB.
 * 
 * Safe to call multiple times - will reuse the existing connection if already
 * connected. Uses connection pooling for efficient resource management.
 * 
 * @returns The MongoDB database instance
 * @throws Error if connection fails
 * 
 * @example
 * ```typescript
 * // Connect at application startup
 * try {
 *   const db = await connectMongo();
 *   console.log('Connected to:', db.databaseName);
 * } catch (error) {
 *   console.error('Failed to connect:', error);
 *   process.exit(1);
 * }
 * ```
 */
export async function connectMongo(): Promise<Db> {
  if (db) return db;

  try {
    client = new MongoClient(config.mongodb.uri, connectionOptions);
    await client.connect();
    db = client.db(config.mongodb.dbName);

    elog.info('Connected to MongoDB', { database: config.mongodb.dbName });
    return db;
  } catch (error) {
    elog.error('Failed to connect to MongoDB', { error });
    throw error;
  }
}

/**
 * Gets the MongoDB database instance.
 * 
 * Returns the connected database instance for direct database operations.
 * Must call `connectMongo()` first or this will throw.
 * 
 * @returns The MongoDB database instance
 * @throws Error if not connected to MongoDB
 * 
 * @example
 * ```typescript
 * const db = getDb();
 * 
 * // Run aggregation
 * const results = await db.collection('users').aggregate([...]).toArray();
 * 
 * // Run command
 * const stats = await db.command({ dbStats: 1 });
 * ```
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

/**
 * Gets a typed MongoDB collection.
 * 
 * Provides type-safe access to a collection with full TypeScript support
 * for document operations (find, insert, update, delete).
 * 
 * @typeParam T - The document type for the collection (must extend Document)
 * @param name - The collection name
 * @returns A typed Collection instance
 * @throws Error if not connected to MongoDB
 * 
 * @example
 * ```typescript
 * interface UserDocument extends Document {
 *   email: string;
 *   name: string;
 *   createdAt: Date;
 * }
 * 
 * const users = getCollection<UserDocument>('users');
 * 
 * // Full type safety on operations
 * const user = await users.findOne({ email: 'test@example.com' });
 * if (user) {
 *   console.log(user.name); // TypeScript knows this exists
 * }
 * 
 * // Insert with type checking
 * await users.insertOne({
 *   email: 'new@example.com',
 *   name: 'New User',
 *   createdAt: new Date(),
 * });
 * ```
 */
export function getCollection<T extends Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

/**
 * Gets the MongoDB client instance.
 * 
 * Required for operations that need direct client access, such as
 * starting transactions. Must call `connectMongo()` first.
 * 
 * @returns The MongoDB client instance
 * @throws Error if not connected to MongoDB
 */
export function getMongoClient(): MongoClient {
  if (!client) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return client;
}

/**
 * Executes a callback within a MongoDB transaction.
 * 
 * Provides ACID transaction support for multi-document operations.
 * The transaction is automatically committed on success or aborted on error.
 * 
 * NOTE: Requires a MongoDB replica set. Single-node deployments won't support transactions.
 * 
 * @param callback - Function to execute within the transaction
 * @param options - Transaction options (read/write concern, etc.)
 * @returns The result of the callback
 * @throws Error if the transaction fails
 * 
 * @example
 * ```typescript
 * const result = await withTransaction(async (session) => {
 *   await users.insertOne({ name: 'test' }, { session });
 *   await logs.insertOne({ action: 'user_created' }, { session });
 *   return { success: true };
 * });
 * ```
 */
export async function withTransaction<T>(
  callback: (session: ClientSession) => Promise<T>,
  options?: TransactionOptions
): Promise<T> {
  const mongoClient = getMongoClient();
  const session = mongoClient.startSession();
  
  try {
    const result = await session.withTransaction(callback, options);
    return result as T;
  } finally {
    await session.endSession();
  }
}

/**
 * Health check result for MongoDB.
 */
export interface MongoHealthResult {
  /** Connection status: 'up' if connected and responsive, 'down' otherwise */
  status: 'up' | 'down';
  /** Round-trip latency in milliseconds (only present when status is 'up') */
  latencyMs?: number;
  /** Error message (only present when status is 'down') */
  error?: string;
}

/**
 * Checks if MongoDB is connected and responsive.
 * 
 * Performs a ping command to verify the connection is alive and measures
 * the round-trip latency. Useful for health check endpoints and monitoring.
 * 
 * @returns Health check result with status and latency
 * 
 * @example
 * ```typescript
 * // Health check endpoint
 * app.get('/health', async (ctx) => {
 *   const mongo = await checkMongoHealth();
 *   const redis = await checkRedisHealth();
 *   
 *   return success({
 *     status: mongo.status === 'up' && redis.status === 'up' ? 'healthy' : 'degraded',
 *     services: { mongo, redis }
 *   });
 * });
 * ```
 */
export async function checkMongoHealth(): Promise<MongoHealthResult> {
  if (!client || !db) {
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
 * Gracefully disconnects from MongoDB.
 * 
 * Closes the connection and releases all pooled connections. Safe to call
 * even if not connected (will be a no-op). Should be called during graceful
 * shutdown.
 * 
 * @example
 * ```typescript
 * // Graceful shutdown handler
 * process.on('SIGTERM', async () => {
 *   console.log('Shutting down...');
 *   await disconnectMongo();
 *   await disconnectRedis();
 *   process.exit(0);
 * });
 * ```
 */
export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    elog.info('Disconnected from MongoDB');
  }
}

/**
 * Collection name constants.
 * 
 * Centralized collection names to prevent typos and enable easy refactoring.
 * Use these constants instead of string literals throughout the codebase.
 * 
 * @example
 * ```typescript
 * import { getCollection, Collections } from './db';
 * 
 * // Use constant instead of string literal
 * const users = getCollection<UserDocument>(Collections.USERS);
 * const sessions = getCollection<SessionDocument>(Collections.SESSIONS);
 * const audits = getCollection<AuditLogDocument>(Collections.AUDIT_LOGS);
 * ```
 */
export const Collections = {
  /** User accounts collection */
  USERS: 'users',
  /** Active sessions collection */
  SESSIONS: 'sessions',
  /** Security audit logs collection */
  AUDIT_LOGS: 'audit_logs',
  /** TOTP authenticator credentials */
  TOTP_CREDENTIALS: 'totp_credentials',
  /** WebAuthn/passkey credentials */
  WEBAUTHN_CREDENTIALS: 'webauthn_credentials',
  /** MFA backup codes */
  MFA_BACKUP_CODES: 'mfa_backup_codes',
  /** User identities collection */
  IDENTITIES: 'identities',
  /** Identity sessions collection */
  IDENTITY_SESSIONS: 'identity_sessions',
  /** Blocks between identities */
  BLOCKS: 'blocks',
  /** Friend requests between identities */
  FRIEND_REQUESTS: 'friend_requests',
  /** Established friendships (denormalized, two records per friendship) */
  FRIENDSHIPS: 'friendships',
  /** Notifications for identities */
  NOTIFICATIONS: 'notifications',
  /** Encrypted signing key bundles for E2E encryption */
  KEY_BUNDLES: 'key_bundles',
  /** DM conversations (1-1 messaging) */
  DM_CONVERSATIONS: 'dm_conversations',
  /** DM messages (encrypted) */
  DM_MESSAGES: 'dm_messages',
} as const;

/**
 * Type representing valid collection names.
 * 
 * @example
 * ```typescript
 * function getCollectionByName(name: CollectionName) {
 *   return getCollection(name);
 * }
 * ```
 */
export type CollectionName = typeof Collections[keyof typeof Collections];

/**
 * Initializes MongoDB collections.
 * 
 * Creates all defined collections if they don't already exist. This ensures
 * the database and collections are visible in MongoDB tools even before
 * any data is written. Useful for development and staging environments.
 * 
 * @returns Array of collection names that were created
 * 
 * @example
 * ```typescript
 * // Initialize collections on startup
 * await connectMongo();
 * const created = await initializeCollections();
 * console.log('Created collections:', created);
 * ```
 */
export async function initializeCollections(): Promise<string[]> {
  const database = getDb();
  const existingCollections = await database.listCollections().toArray();
  const existingNames = new Set(existingCollections.map(c => c.name));
  
  const created: string[] = [];
  
  for (const collectionName of Object.values(Collections)) {
    if (!existingNames.has(collectionName)) {
      await database.createCollection(collectionName);
      created.push(collectionName);
      elog.info('Created MongoDB collection', { collection: collectionName });
    }
  }
  
  if (created.length === 0) {
    elog.info('All MongoDB collections already exist');
  }

  // Create indexes
  await createIndexes();
  
  return created;
}

/**
 * Creates indexes for all collections.
 * 
 * Ensures efficient queries on common fields like email, phone, sessionId, etc.
 * Safe to call multiple times - indexes are created if they don't exist.
 */
async function createIndexes(): Promise<void> {
  const database = getDb();

  // Users collection indexes
  const users = database.collection(Collections.USERS);
  await users.createIndex({ email: 1 }, { unique: true, sparse: true });
  await users.createIndex({ phone: 1 }, { unique: true, sparse: true });
  await users.createIndex({ lockedUntil: 1 }, { sparse: true });

  // Sessions collection indexes
  const sessions = database.collection(Collections.SESSIONS);
  await sessions.createIndex({ sessionId: 1 }, { unique: true });
  await sessions.createIndex({ userId: 1 });
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index for auto-cleanup
  await sessions.createIndex({ revoked: 1, expiresAt: 1 });

  // Audit logs collection indexes
  const auditLogs = database.collection(Collections.AUDIT_LOGS);
  await auditLogs.createIndex({ userId: 1, createdAt: -1 });
  await auditLogs.createIndex({ action: 1, createdAt: -1 });
  await auditLogs.createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 }); // 90 day retention

  // TOTP credentials collection indexes
  const totpCredentials = database.collection(Collections.TOTP_CREDENTIALS);
  await totpCredentials.createIndex({ userId: 1 });

  // WebAuthn credentials collection indexes
  const webauthnCredentials = database.collection(Collections.WEBAUTHN_CREDENTIALS);
  await webauthnCredentials.createIndex({ userId: 1 });
  await webauthnCredentials.createIndex({ credentialId: 1 }, { unique: true });

  // MFA backup codes collection indexes
  const mfaBackupCodes = database.collection(Collections.MFA_BACKUP_CODES);
  await mfaBackupCodes.createIndex({ userId: 1 }, { unique: true });

  // Identities collection indexes
  const identities = database.collection(Collections.IDENTITIES);
  // Partial unique index - only enforce uniqueness for non-deleted identities
  await identities.createIndex(
    { ident: 1 },
    { unique: true, partialFilterExpression: { ident: { $ne: 'deleted' } } }
  );
  await identities.createIndex({ username: 1 }, { unique: true });
  await identities.createIndex({ lastActiveAt: 1 });

  // Identity sessions collection indexes
  const identitySessions = database.collection(Collections.IDENTITY_SESSIONS);
  await identitySessions.createIndex({ identitySessionId: 1 }, { unique: true });
  await identitySessions.createIndex({ identityId: 1 });
  await identitySessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index
  await identitySessions.createIndex({ revoked: 1, expiresAt: 1 });

  // Blocks collection indexes
  const blocks = database.collection(Collections.BLOCKS);
  await blocks.createIndex(
    { blockerIdentityId: 1, blockedIdentityId: 1 },
    { unique: true }
  );
  await blocks.createIndex({ blockedIdentityId: 1, blockerIdentityId: 1 });
  await blocks.createIndex({ blockerIdentityId: 1 });

  // Friend requests collection indexes
  const friendRequests = database.collection(Collections.FRIEND_REQUESTS);
  await friendRequests.createIndex(
    { fromIdentityId: 1, toIdentityId: 1 },
    { unique: true }
  );
  await friendRequests.createIndex({ toIdentityId: 1, status: 1 });
  await friendRequests.createIndex({ fromIdentityId: 1, status: 1 });
  await friendRequests.createIndex({ status: 1, updatedAt: 1 });

  // Friendships collection indexes
  const friendships = database.collection(Collections.FRIENDSHIPS);
  await friendships.createIndex(
    { identityId: 1, friendIdentityId: 1 },
    { unique: true }
  );
  await friendships.createIndex({ identityId: 1, createdAt: -1 });
  await friendships.createIndex({ friendIdentityId: 1 });

  // Notifications collection indexes
  const notifications = database.collection(Collections.NOTIFICATIONS);
  await notifications.createIndex({ recipientIdentityId: 1, read: 1, createdAt: -1 });
  await notifications.createIndex({ recipientIdentityId: 1, createdAt: -1 });
  await notifications.createIndex({ recipientIdentityId: 1, type: 1 });

  // Key bundles collection indexes
  const keyBundles = database.collection(Collections.KEY_BUNDLES);
  await keyBundles.createIndex({ bundleId: 1 }, { unique: true });

  // DM conversations collection indexes
  const dmConversations = database.collection(Collections.DM_CONVERSATIONS);
  await dmConversations.createIndex({ conversationId: 1 }, { unique: true });

  // DM messages collection indexes
  const dmMessages = database.collection(Collections.DM_MESSAGES);
  await dmMessages.createIndex({ conversationId: 1, createdAt: -1 });
  await dmMessages.createIndex({ toIdentityId: 1, createdAt: -1 });
  await dmMessages.createIndex({ conversationId: 1, clientMessageId: 1 }, { unique: true });
  await dmMessages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

  elog.debug('MongoDB indexes created/verified');
}
