/**
 * MongoDB connection utility
 * Manages connection lifecycle and provides typed database access
 */

import { MongoClient, Db, Collection, Document } from 'mongodb';
import { config } from '../config';

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * MongoDB connection options
 */
const connectionOptions = {
  minPoolSize: config.mongodb.minPoolSize,
  maxPoolSize: config.mongodb.maxPoolSize,
  // Server selection timeout
  serverSelectionTimeoutMS: 5000,
  // Socket timeout
  socketTimeoutMS: 45000,
};

/**
 * Connect to MongoDB
 * Safe to call multiple times - will reuse existing connection
 */
export async function connectMongo(): Promise<Db> {
  if (db) return db;

  try {
    client = new MongoClient(config.mongodb.uri, connectionOptions);
    await client.connect();
    db = client.db(config.mongodb.dbName);

    console.log(`Connected to MongoDB: ${config.mongodb.dbName}`);
    return db;
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw error;
  }
}

/**
 * Get the database instance
 * Throws if not connected
 */
export function getDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

/**
 * Get a typed collection
 */
export function getCollection<T extends Document>(name: string): Collection<T> {
  return getDb().collection<T>(name);
}

/**
 * Check if MongoDB is connected and responsive
 */
export async function checkMongoHealth(): Promise<{
  status: 'up' | 'down';
  latencyMs?: number;
  error?: string;
}> {
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
 * Disconnect from MongoDB
 */
export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('Disconnected from MongoDB');
  }
}

/**
 * Collection name constants
 * Centralized to prevent typos and enable easy refactoring
 */
export const Collections = {
  USERS: 'users',
  SESSIONS: 'sessions',
  AUDIT_LOGS: 'audit_logs',
} as const;
