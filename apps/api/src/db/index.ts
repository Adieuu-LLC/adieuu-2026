/**
 * Database exports
 */

export {
  connectMongo,
  getDb,
  getCollection,
  checkMongoHealth,
  disconnectMongo,
  Collections,
} from './mongo';

export {
  connectRedis,
  getRedis,
  isRedisConnected,
  checkRedisHealth,
  disconnectRedis,
  RedisKeys,
} from './redis';

import { connectMongo, disconnectMongo } from './mongo';
import { connectRedis, disconnectRedis } from './redis';
import { config } from '../config';

/**
 * Initialize all database connections
 */
export async function initializeDatabases(): Promise<void> {
  const errors: Error[] = [];

  try {
    await connectMongo();
  } catch (error) {
    if (config.features.requireDatabase) {
      throw error;
    }
    console.warn('MongoDB connection failed (non-fatal in dev mode):', error);
    errors.push(error as Error);
  }

  try {
    await connectRedis();
  } catch (error) {
    if (config.features.requireDatabase) {
      throw error;
    }
    console.warn('Redis connection failed (non-fatal in dev mode):', error);
    errors.push(error as Error);
  }

  if (errors.length > 0 && !config.features.requireDatabase) {
    console.warn(
      `Database connections failed but REQUIRE_DATABASE is false. ` +
      `Some features may not work correctly.`
    );
  }
}

/**
 * Gracefully close all database connections
 */
export async function closeDatabases(): Promise<void> {
  await Promise.all([
    disconnectMongo(),
    disconnectRedis(),
  ]);
}
