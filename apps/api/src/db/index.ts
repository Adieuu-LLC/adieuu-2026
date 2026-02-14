/**
 * Database Module Exports
 * 
 * Central export point for all database connection and utility functions.
 * Provides unified access to MongoDB and Redis operations.
 * 
 * Initialization:
 * - Call `initializeDatabases()` at application startup
 * - Call `closeDatabases()` during graceful shutdown
 * 
 * @module db
 * 
 * @example
 * ```typescript
 * import {
 *   // Initialization
 *   initializeDatabases,
 *   closeDatabases,
 *   
 *   // MongoDB
 *   getDb,
 *   getCollection,
 *   checkMongoHealth,
 *   Collections,
 *   
 *   // Redis
 *   getRedis,
 *   isRedisConnected,
 *   checkRedisHealth,
 *   RedisKeys,
 * } from './db';
 * 
 * // Startup
 * await initializeDatabases();
 * 
 * // Usage
 * const users = getCollection(Collections.USERS);
 * const redis = getRedis();
 * 
 * // Shutdown
 * await closeDatabases();
 * ```
 */

export {
  connectMongo,
  getDb,
  getCollection,
  checkMongoHealth,
  disconnectMongo,
  Collections,
  type MongoHealthResult,
  type CollectionName,
} from './mongo';

export {
  connectRedis,
  getRedis,
  isRedisConnected,
  checkRedisHealth,
  disconnectRedis,
  RedisKeys,
  type RedisHealthResult,
  type RedisKeyGenerators,
} from './redis';

import { connectMongo, disconnectMongo } from './mongo';
import { connectRedis, disconnectRedis } from './redis';
import { config } from '../config';
import elog from '../utils/adieuuLogger';

/**
 * Initializes all database connections.
 * 
 * Attempts to connect to both MongoDB and Redis. Behavior depends on the
 * `REQUIRE_DATABASE` configuration:
 * 
 * - **Production** (`REQUIRE_DATABASE=true`): Throws on any connection failure
 * - **Development** (`REQUIRE_DATABASE=false`): Logs warnings but continues
 * 
 * Should be called early in application startup before handling requests.
 * 
 * @throws Error if `REQUIRE_DATABASE` is true and any connection fails
 * 
 * @example
 * ```typescript
 * // Application startup
 * async function start() {
 *   try {
 *     await initializeDatabases();
 *     
 *     const server = Bun.serve({
 *       port: config.port,
 *       fetch: app.handler(),
 *     });
 *     
 *     console.log('Server started');
 *   } catch (error) {
 *     console.error('Startup failed:', error);
 *     process.exit(1);
 *   }
 * }
 * ```
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
 * Gracefully closes all database connections.
 * 
 * Disconnects from both MongoDB and Redis in parallel. Safe to call even
 * if some connections were never established. Should be called during
 * graceful shutdown.
 * 
 * @example
 * ```typescript
 * // Graceful shutdown
 * const shutdown = async () => {
 *   console.log('Shutting down gracefully...');
 *   await closeDatabases();
 *   server.stop();
 *   process.exit(0);
 * };
 * 
 * process.on('SIGINT', shutdown);
 * process.on('SIGTERM', shutdown);
 * ```
 */
export async function closeDatabases(): Promise<void> {
  await Promise.all([
    disconnectMongo(),
    disconnectRedis(),
  ]);
}
