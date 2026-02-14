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

import { MongoClient, Db, Collection, Document } from 'mongodb';
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
  
  return created;
}
