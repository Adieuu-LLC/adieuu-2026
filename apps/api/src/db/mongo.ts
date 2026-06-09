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
  /** User identities collection */
  IDENTITIES: 'identities',
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
  /** Conversations (DM and group) */
  CONVERSATIONS: 'conversations',
  /** Encrypted messages */
  MESSAGES: 'messages',
  /** Live calls (audio/video/screenshare) within conversations */
  CALLS: 'calls',
  /** Group conversation invites (opt-in approval flow) */
  GROUP_INVITES: 'group_invites',
  /** Pre-keys for forward secrecy (signed + one-time) */
  PRE_KEYS: 'pre_keys',
  /** E2E-encrypted emoji reactions linked to messages */
  REACTIONS: 'reactions',
  /** Key-value platform configuration (typed values per key) */
  PLATFORM_SETTINGS: 'platform_settings',
  /** User appearance/theme preferences (one per user) */
  USER_PREFERENCES: 'user_preferences',
  /** Community-shared themes */
  COMMUNITY_THEMES: 'community_themes',
  /** E2E-encrypted identity preferences (theme, etc.) */
  IDENTITY_ENCRYPTED_PREFS: 'identity_encrypted_prefs',
  /** Media upload tracking (presigned URLs, processing status) */
  MEDIA_UPLOADS: 'media_uploads',
  /** E2E encrypted media for conversation attachments */
  E2E_MEDIA: 'e2e_media',
  /** Platform moderation reports (content, abuse, etc.) */
  PLATFORM_REPORTS: 'platform_reports',
  /** Timeline events for platform reports (comments, state transitions, actions) */
  PLATFORM_REPORT_EVENTS: 'platform_report_events',
  /** User support tickets */
  SUPPORT_TICKETS: 'support_tickets',
  /** Timeline events for support tickets */
  SUPPORT_TICKET_EVENTS: 'support_ticket_events',
  /** Per-accountHash identity creation counts (unique index on accountHash) */
  IDENTITY_COUNTS: 'identity_counts',
  /** Anonymised Klipy search term logs (no identity linkage) */
  KLIPY_SEARCH_LOGS: 'klipy_search_logs',
  /** Achievements awarded to identities */
  IDENTITY_ACHIEVEMENTS: 'identity_achievements',
  /** Per-identity conversation preferences (archive, favorites) */
  CONVERSATION_PREFERENCES: 'conversation_preferences',
  /** Stripe webhook event idempotency (TTL-indexed by processedAt) */
  STRIPE_PROCESSED_EVENTS: 'stripe_processed_events',
  /** Jurisdiction regulatory matrix (age verification, etc.) */
  JURISDICTION_REQUIREMENTS: 'jurisdiction_requirements',
  /** OFAC / export-control sanctioned countries */
  SANCTIONED_COUNTRIES: 'sanctioned_countries',
  /** Age verification attempt tracking */
  AGE_VERIFICATIONS: 'age_verifications',
  /** User-uploaded custom emojis (static and animated) */
  CUSTOM_EMOJIS: 'custom_emojis',
  /** Sponsorship requests directory (one per account) */
  SPONSORSHIP_REQUESTS: 'sponsorship_requests',
  /** Sponsorship fulfillment audit logs */
  SPONSORSHIP_LOGS: 'sponsorship_logs',
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
 * Indexes for community theme listing, search, and author lookups.
 * Safe to call multiple times (idempotent).
 */
async function ensureCommunityThemesIndexes(database: Db): Promise<void> {
  const communityThemes = database.collection(Collections.COMMUNITY_THEMES);
  await communityThemes.createIndex({ authorIdentityId: 1 });
  await communityThemes.createIndex({ downloads: -1 });
  await communityThemes.createIndex({ tags: 1 });
  await communityThemes.createIndex({ createdAt: -1 });
  await communityThemes.createIndex(
    { name: 'text' },
    { default_language: 'english' },
  );
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
  await users.createIndex(
    { email: 1 },
    { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
  );
  await users.createIndex(
    { phone: 1 },
    { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
  );
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

  // Identities collection indexes
  const identities = database.collection(Collections.IDENTITIES);
  // Unique index on ident - deleted identities get unique idents like '_deleted_{objectId}'
  await identities.createIndex({ ident: 1 }, { unique: true });
  await identities.createIndex({ username: 1 }, { unique: true });
  await identities.createIndex({ lastActiveAt: 1 });

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

  // Conversations collection indexes
  const conversations = database.collection(Collections.CONVERSATIONS);
  await conversations.createIndex({ participants: 1 });
  await conversations.createIndex({ type: 1, participants: 1 });
  await conversations.createIndex({ lastMessageAt: -1 });
  await conversations.createIndex({ admins: 1 });

  // Messages collection indexes
  const messages = database.collection(Collections.MESSAGES);
  await messages.createIndex({ conversationId: 1, createdAt: -1 });
  await messages.createIndex({ conversationId: 1, clientMessageId: 1 }, { unique: true });
  await messages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

  // Calls collection indexes
  const calls = database.collection(Collections.CALLS);
  await calls.createIndex({ conversationId: 1, status: 1 });
  await calls.createIndex(
    { conversationId: 1 },
    { unique: true, partialFilterExpression: { status: { $ne: 'ended' } } }
  );
  try { await calls.dropIndex('endedAt_1'); } catch { /* index may not exist yet */ }
  await calls.createIndex({ endedAt: 1 }, { expireAfterSeconds: 60 * 60, sparse: true });

  // Group invites collection indexes
  const groupInvites = database.collection(Collections.GROUP_INVITES);
  await groupInvites.createIndex({ invitedIdentityId: 1, status: 1 });
  await groupInvites.createIndex({ conversationId: 1 });

  // Pre-keys collection indexes
  const preKeys = database.collection(Collections.PRE_KEYS);
  await preKeys.createIndex({ identityId: 1, deviceId: 1, keyType: 1, consumed: 1 });
  await preKeys.createIndex(
    { identityId: 1, deviceId: 1, keyType: 1, expiresAt: 1 },
    { partialFilterExpression: { keyType: 'signed' } }
  );
  await preKeys.createIndex({ keyId: 1 }, { unique: true });
  await preKeys.createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0, partialFilterExpression: { consumed: true } }
  );

  // Reactions collection indexes
  const reactions = database.collection(Collections.REACTIONS);
  await reactions.createIndex({ messageId: 1, createdAt: 1 });
  await reactions.createIndex({ conversationId: 1, clientReactionId: 1 }, { unique: true });
  await reactions.createIndex({ fromIdentityId: 1, messageId: 1 });
  await reactions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

  // Platform settings — one row per key
  const platformSettings = database.collection(Collections.PLATFORM_SETTINGS);
  await platformSettings.createIndex({ key: 1 }, { unique: true });

  // User preferences — one document per user
  const userPreferences = database.collection(Collections.USER_PREFERENCES);
  await userPreferences.createIndex({ userId: 1 }, { unique: true });

  // Community themes
  await ensureCommunityThemesIndexes(database);

  // Identity encrypted preferences — one per identity (keyed by prefsId)
  const identityEncryptedPrefs = database.collection(Collections.IDENTITY_ENCRYPTED_PREFS);
  await identityEncryptedPrefs.createIndex({ prefsId: 1 }, { unique: true });

  // Media uploads — tracks presigned URL lifecycle and processing status
  const mediaUploads = database.collection(Collections.MEDIA_UPLOADS);
  await mediaUploads.createIndex({ mediaId: 1 }, { unique: true });
  await mediaUploads.createIndex({ identityId: 1, createdAt: -1 });
  await mediaUploads.createIndex({ status: 1 });
  await mediaUploads.createIndex({ scanHash: 1 }, { sparse: true });
  await mediaUploads.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { status: 'pending' } }
  );
  await mediaUploads.createIndex(
    { updatedAt: 1 },
    {
      expireAfterSeconds: 7 * 24 * 60 * 60,
      partialFilterExpression: {
        purpose: 'conv_scan',
        status: { $in: ['ready', 'rejected', 'failed'] },
      },
    }
  );

  // E2E media — tracks E2E encrypted conversation media uploads
  const e2eMedia = database.collection(Collections.E2E_MEDIA);
  await e2eMedia.createIndex({ e2eMediaId: 1 }, { unique: true });
  await e2eMedia.createIndex({ identityId: 1, createdAt: -1 });
  await e2eMedia.createIndex({ scanHash: 1 }, { unique: true });
  await e2eMedia.createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: 24 * 60 * 60, partialFilterExpression: { status: 'pending' } }
  );
  await e2eMedia.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

  // Identity counts collection indexes
  const identityCounts = database.collection(Collections.IDENTITY_COUNTS);
  await identityCounts.createIndex({ accountHash: 1 }, { unique: true });

  // Klipy search logs — time-series analytics (90-day retention)
  const klipySearchLogs = database.collection(Collections.KLIPY_SEARCH_LOGS);
  await klipySearchLogs.createIndex({ timestamp: -1 });
  await klipySearchLogs.createIndex({ term: 1, timestamp: -1 });
  await klipySearchLogs.createIndex(
    { timestamp: 1 },
    { expireAfterSeconds: 90 * 24 * 60 * 60 }
  );

  // Identity achievements — one record per identity per achievement
  const identityAchievements = database.collection(Collections.IDENTITY_ACHIEVEMENTS);
  await identityAchievements.createIndex(
    { identityId: 1, achievementId: 1 },
    { unique: true }
  );
  await identityAchievements.createIndex({ achievementId: 1 });
  await identityAchievements.createIndex({ identityId: 1, awardedAt: -1 });

  // Conversation preferences — per-identity archive/favorite state
  const conversationPreferences = database.collection(Collections.CONVERSATION_PREFERENCES);
  await conversationPreferences.createIndex(
    { identityId: 1, conversationId: 1 },
    { unique: true },
  );
  await conversationPreferences.createIndex({ identityId: 1 });

  // Stripe webhook idempotency — TTL auto-deletes after 30 days
  const stripeEvents = database.collection(Collections.STRIPE_PROCESSED_EVENTS);
  await stripeEvents.createIndex({ eventId: 1 }, { unique: true });
  await stripeEvents.createIndex({ processedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

  // Jurisdiction requirements — one document per jurisdiction code
  const jurisdictionRequirements = database.collection(Collections.JURISDICTION_REQUIREMENTS);
  await jurisdictionRequirements.createIndex({ jurisdiction: 1 }, { unique: true });

  // Sanctioned countries — one document per ISO country code
  const sanctionedCountries = database.collection(Collections.SANCTIONED_COUNTRIES);
  await sanctionedCountries.createIndex({ countryCode: 1 }, { unique: true });
  await sanctionedCountries.createIndex({ active: 1 });

  // Age verifications — lookup by user and by provider verification id
  const ageVerifications = database.collection(Collections.AGE_VERIFICATIONS);
  await ageVerifications.createIndex({ userId: 1 });
  await ageVerifications.createIndex({ providerVerificationId: 1 }, { unique: true, sparse: true });

  // Custom emojis — unique shortcode, per-identity listing
  const customEmojis = database.collection(Collections.CUSTOM_EMOJIS);
  await customEmojis.createIndex(
    { shortcode: 1 },
    { unique: true, collation: { locale: 'en', strength: 2 } }
  );
  await customEmojis.createIndex({ identityId: 1, createdAt: -1 });

  // Sponsorship requests — one per account, directory listing by status + date
  const sponsorshipRequests = database.collection(Collections.SPONSORSHIP_REQUESTS);
  await sponsorshipRequests.createIndex({ userId: 1 }, { unique: true });
  await sponsorshipRequests.createIndex({ status: 1, createdAt: -1 });

  // Sponsorship logs — lookup by recipient
  const sponsorshipLogs = database.collection(Collections.SPONSORSHIP_LOGS);
  await sponsorshipLogs.createIndex({ recipientUserId: 1, grantedAt: -1 });
  await sponsorshipLogs.createIndex({ requestId: 1 }, { unique: true });

  const supportTickets = database.collection(Collections.SUPPORT_TICKETS);
  await supportTickets.createIndex({ ticketId: 1 }, { unique: true });
  await supportTickets.createIndex({ status: 1, createdAt: -1 });
  await supportTickets.createIndex({ assignedTo: 1, status: 1 });
  await supportTickets.createIndex({ submitterType: 1, submitterId: 1, createdAt: -1 });

  const supportTicketEvents = database.collection(Collections.SUPPORT_TICKET_EVENTS);
  await supportTicketEvents.createIndex({ ticketObjectId: 1, createdAt: 1 });
  await supportTicketEvents.createIndex({ ticketId: 1, createdAt: 1 });

  elog.debug('MongoDB indexes created/verified');
}

/**
 * Ensures collections that are critical for core functionality exist,
 * regardless of the `INITIALIZE_COLLECTIONS` feature flag.
 *
 * Currently this covers `identity_counts`, which must be present before
 * the first identity-creation transaction runs, and `community_themes` so
 * uploads and public browse work when `INITIALIZE_COLLECTIONS` is false.
 */
export async function ensureCriticalCollections(): Promise<void> {
  const database = getDb();
  const existing = await database.listCollections().toArray();
  const names = new Set(existing.map((c) => c.name));

  if (!names.has(Collections.IDENTITY_COUNTS)) {
    await database.createCollection(Collections.IDENTITY_COUNTS);
    elog.info('Created critical collection', { collection: Collections.IDENTITY_COUNTS });
  }

  const identityCounts = database.collection(Collections.IDENTITY_COUNTS);
  await identityCounts.createIndex({ accountHash: 1 }, { unique: true });

  if (!names.has(Collections.COMMUNITY_THEMES)) {
    await database.createCollection(Collections.COMMUNITY_THEMES);
    elog.info('Created critical collection', { collection: Collections.COMMUNITY_THEMES });
  }

  await ensureCommunityThemesIndexes(database);
}
