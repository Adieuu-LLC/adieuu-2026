/**
 * Database module exports
 */

export * from './redis';
export * from './mongo';

import { connectRedis, disconnectRedis } from './redis';
import { connectMongo, disconnectMongo } from './mongo';
import { config } from '../config';
import logger from '../utils/logger';

/**
 * Initializes all database connections
 */
export async function initializeDatabases(): Promise<void> {
  const promises: Promise<void>[] = [];

  promises.push(
    connectRedis().catch((err) => {
      logger.error('Failed to connect to Redis', { error: err });
      if (config.features.requireDatabase) {
        throw err;
      }
    })
  );

  promises.push(
    connectMongo().catch((err) => {
      logger.error('Failed to connect to MongoDB', { error: err });
      if (config.features.requireDatabase) {
        throw err;
      }
    })
  );

  await Promise.all(promises);
}

/**
 * Closes all database connections
 */
export async function closeDatabases(): Promise<void> {
  await Promise.all([disconnectRedis(), disconnectMongo()]);
}
