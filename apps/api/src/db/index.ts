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
import elog from '../utils/adieuuLogger';

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
    elog.warn('MongoDB connection failed (non-fatal in dev mode)', { error });
    errors.push(error as Error);
  }

  try {
    await connectRedis();
  } catch (error) {
    if (config.features.requireDatabase) {
      throw error;
    }
    elog.warn('Redis connection failed (non-fatal in dev mode)', { error });
    errors.push(error as Error);
  }

  if (errors.length > 0 && !config.features.requireDatabase) {
    elog.warn('Database connections failed but REQUIRE_DATABASE is false - some features may not work');
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
